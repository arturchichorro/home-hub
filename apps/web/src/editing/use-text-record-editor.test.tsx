import {
  type FlashcardFields,
  flashcardFieldsSchema,
} from "@home-hub/shared/flashcards";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTextRecordEditor } from "./use-text-record-editor";

const existing = { front: "Question", back: "Answer" };
const blank = { front: "", back: "" };
function setup({
  initial = existing,
  persisted = true,
  current = (persisted ? existing : undefined) as FlashcardFields | undefined,
  enabled = true,
  save = vi.fn(
    async (
      _next: FlashcardFields,
      _previous: FlashcardFields | undefined,
    ) => {},
  ),
} = {}) {
  let editor:
    | ReturnType<typeof useTextRecordEditor<FlashcardFields>>
    | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR capture harness, not a recreated mounted subtree.
  function Capture() {
    editor = useTextRecordEditor({
      initial,
      persisted,
      current,
      enabled,
      save,
      invalidError: "Both required",
      prepare(value) {
        const parsed = flashcardFieldsSchema.safeParse(value);
        return parsed.success ? parsed.data : undefined;
      },
    });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) {
    throw Error("Missing editor");
  }
  return { editor, save };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("creates nothing for untouched pairs; incomplete pairs are retained without writes", async () => {
  const { editor, save } = setup({ initial: blank, persisted: false });
  expect(await editor.flush()).toBe(true);
  editor.change({ front: "Only one side" });
  await vi.advanceTimersByTimeAsync(700);
  expect(save).not.toHaveBeenCalled();
  expect(await editor.flush()).toBe(false);
  expect(editor.snapshot()).toMatchObject({
    value: { front: "Only one side", back: "" },
    hasChanges: true,
    saved: false,
  });
});
it("autosaves complete pairs once and retains exact whitespace", async () => {
  const { editor, save } = setup({ initial: blank, persisted: false });
  editor.change({ front: "  Front\n" });
  editor.change({ back: "Back\n  " });
  await vi.advanceTimersByTimeAsync(599);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith(
    { front: "  Front\n", back: "Back\n  " },
    undefined,
  );
  expect(editor.snapshot().saved).toBe(true);
  expect(await editor.flush()).toBe(true);
  expect(save).toHaveBeenCalledOnce();
});
it("serializes creation and drains edits made during the request without creating twice", async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const save = vi
    .fn(
      async (
        _next: FlashcardFields,
        _previous: FlashcardFields | undefined,
      ) => {},
    )
    .mockImplementationOnce(() => pending);
  const { editor } = setup({ initial: blank, persisted: false, save });
  editor.change(existing);
  const flushing = editor.flush();
  editor.change({ back: "Changed during create" });
  expect(editor.snapshot().isSaving).toBe(true);
  finish?.();
  expect(await flushing).toBe(true);
  expect(save.mock.calls).toEqual([
    [existing, undefined],
    [{ ...existing, back: "Changed during create" }, existing],
  ]);
  expect(editor.snapshot().isSaving).toBe(false);
});
it("keeps failures for retry and discards only unsaved changes", async () => {
  const save = vi
    .fn(
      async (
        _next: FlashcardFields,
        _previous: FlashcardFields | undefined,
      ) => {},
    )
    .mockRejectedValueOnce(Error("failure"));
  const { editor } = setup({ save });
  editor.change({ back: "New answer" });
  expect(await editor.flush()).toBe(false);
  expect(editor.snapshot().value.back).toBe("New answer");
  expect(await editor.flush()).toBe(true);
  editor.change({ front: "Discard this" });
  editor.discard();
  expect(editor.snapshot().value).toEqual({ ...existing, back: "New answer" });
});
it("preserves invalid edits to existing cards instead of saving blank sides", async () => {
  const { editor, save } = setup();
  editor.change({ back: "" });
  expect(await editor.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(editor.snapshot().value.back).toBe("");
  editor.discard();
  expect(editor.snapshot().value).toEqual(existing);
});
it("permits clean offline reads but refuses to save dirty offline drafts", async () => {
  const { editor, save } = setup({ enabled: false });
  expect(await editor.flush()).toBe(true);
  editor.change({ front: "Offline draft" });
  expect(await editor.flush()).toBe(false);
  expect(editor.snapshot().value.front).toBe("Offline draft");
  expect(save).not.toHaveBeenCalled();
});
it("discards and retries using only declared text fields, never database metadata", async () => {
  const current = { ...existing, id: "database-id" };
  const { editor, save } = setup({ current });
  editor.change({ back: "" });
  expect(await editor.flush()).toBe(false);
  editor.discard();
  expect(editor.snapshot().value).toEqual(existing);
  editor.change({ front: "After discard" });
  await vi.advanceTimersByTimeAsync(600);
  expect(save).toHaveBeenCalledExactlyOnceWith(
    { ...existing, front: "After discard" },
    existing,
  );
});

it("does not discard a save that is still in flight", async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { editor } = setup({ save: vi.fn(() => pending) });
  editor.change({ back: "Pending" });
  const flushing = editor.flush();
  editor.discard();
  expect(editor.snapshot().value.back).toBe("Pending");
  finish?.();
  expect(await flushing).toBe(true);
});
