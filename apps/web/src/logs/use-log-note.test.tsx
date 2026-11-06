import type { LogEntrySnapshot } from "@home-hub/shared/logs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogConflict, readLogEntry, writeLogEntry } from "./api";
import { useLogNote } from "./use-log-note";

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();

  return { ...real, writeLogEntry: vi.fn(), readLogEntry: vi.fn() };
});

const old: LogEntrySnapshot = {
  id: crypto.randomUUID(),
  entryOn: "2026-11-01",
  note: "Saved",
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: crypto.randomUUID(),
  lastEditedBy: crypto.randomUUID(),
};

function capture(entry: LogEntrySnapshot | null = old) {
  let editor: ReturnType<typeof useLogNote> | undefined;

  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR hook harness; never recreates a mounted subtree.
  function Capture() {
    editor = useLogNote({
      entry,
      householdId: crypto.randomUUID(),
      logId: crypto.randomUUID(),
      entryOn: old.entryOn,
      session: {
        accessToken: "token",
        userId: old.createdBy,
        onSessionExpired: vi.fn(),
      },
      enabled: true,
      onWork: vi.fn(),
    });

    return null;
  }

  renderToStaticMarkup(<Capture />);

  if (!editor) {
    throw Error("Missing editor");
  }

  return editor;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(writeLogEntry).mockReset();
  vi.mocked(readLogEntry).mockResolvedValue(old);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("shared daily note drafts", () => {
  it("autosaves nonempty text with the observed base revision", async () => {
    vi.mocked(writeLogEntry).mockResolvedValue({
      ...old,
      note: "New",
      version: 2,
    });

    const e = capture();
    e.changeValue("New");
    await vi.advanceTimersByTimeAsync(599);
    expect(writeLogEntry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeLogEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedVersion: 1,
        entryId: old.id,
        note: "New",
      }),
    );
    expect(e.value).toBe("New");
    expect(e.hasChanges).toBe(false);
  });
  it("preserves indentation and a trailing newline during an autosave pause", async () => {
    vi.mocked(writeLogEntry).mockResolvedValue({
      ...old,
      note: "  New line\n",
      version: 2,
    });

    const e = capture();
    e.changeValue("  New line\n");
    await vi.advanceTimersByTimeAsync(600);
    expect(e.value).toBe("  New line\n");
    expect(vi.mocked(writeLogEntry).mock.calls[0]?.[1].note).toBe(
      "  New line\n",
    );
  });
  it("never clears during a typing pause, but soft-removes on blur", async () => {
    vi.mocked(writeLogEntry).mockResolvedValue(null);

    const e = capture();
    e.changeValue("");
    await vi.advanceTimersByTimeAsync(3000);
    expect(writeLogEntry).not.toHaveBeenCalled();
    expect(e.hasChanges).toBe(true);
    e.handleBlur();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeLogEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: "", expectedVersion: 1 }),
    );
    expect(e.hasChanges).toBe(false);
  });
  it("does not remove a note while select-all replacement is in progress", async () => {
    vi.mocked(writeLogEntry).mockResolvedValue({
      ...old,
      note: "Replacement",
      version: 2,
    });

    const e = capture();
    e.changeValue("");
    await vi.advanceTimersByTimeAsync(1000);
    e.changeValue("Replacement");
    await vi.advanceTimersByTimeAsync(600);
    expect(writeLogEntry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeLogEntry).mock.calls[0]?.[1].note).toBe(
      "Replacement",
    );
  });
  it("preserves newer input while a prior save is in flight", async () => {
    let resolve: (r: LogEntrySnapshot) => void = () => {};
    vi.mocked(writeLogEntry)
      .mockImplementationOnce(
        () =>
          new Promise((ok) => {
            resolve = ok;
          }),
      )
      .mockResolvedValueOnce({ ...old, note: "Second", version: 3 });

    const e = capture();
    e.changeValue("First");
    await vi.advanceTimersByTimeAsync(600);
    e.changeValue("Second");
    resolve({ ...old, note: "First", version: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(e.value).toBe("Second");
    expect(vi.mocked(writeLogEntry).mock.calls[1]?.[1]).toMatchObject({
      note: "Second",
      expectedVersion: 2,
    });
  });
  it("keeps rejected text and retries an identical idempotent operation", async () => {
    vi.mocked(writeLogEntry)
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce({ ...old, note: "Retained", version: 2 });

    const e = capture();
    e.changeValue("Retained");
    await vi.advanceTimersByTimeAsync(600);
    expect(e.value).toBe("Retained");
    expect(e.hasChanges).toBe(true);
    e.retry();
    await vi.advanceTimersByTimeAsync(0);

    const calls = vi.mocked(writeLogEntry).mock.calls;
    expect(calls[0]?.[1].writeId).toBe(calls[1]?.[1].writeId);
    expect(e.hasChanges).toBe(false);
  });
  it("pauses on conflict, keeps both texts and rebases only after explicit replacement", async () => {
    const newer = { ...old, note: "Other member", version: 4 };
    vi.mocked(writeLogEntry)
      .mockRejectedValueOnce(new LogConflict(newer))
      .mockResolvedValueOnce({ ...newer, note: "Reconciled", version: 5 });

    const e = capture();
    e.changeValue("Mine");
    await vi.advanceTimersByTimeAsync(600);
    expect(e.hasConflict).toBe(true);
    expect(e.value).toBe("Mine");
    expect(e.conflict?.note).toBe("Other member");
    e.changeValue("Reconciled");
    await vi.advanceTimersByTimeAsync(2000);
    expect(writeLogEntry).toHaveBeenCalledTimes(1);
    e.replace();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(writeLogEntry).mock.calls[1]?.[1]).toMatchObject({
      expectedVersion: 4,
      note: "Reconciled",
    });
    expect(e.hasConflict).toBe(false);
  });
  it("Use saved discards only the local draft and never writes", async () => {
    vi.mocked(writeLogEntry).mockRejectedValueOnce(
      new LogConflict({ ...old, note: "Other", version: 3 }),
    );

    const e = capture();
    e.changeValue("Mine");
    await vi.advanceTimersByTimeAsync(600);
    e.discard();
    expect(e.value).toBe("Other");
    expect(e.hasChanges).toBe(false);
    expect(writeLogEntry).toHaveBeenCalledTimes(1);
  });
});
