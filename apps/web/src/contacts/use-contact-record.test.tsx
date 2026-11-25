import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContactConflict } from "./mutations";
import { type RecordSnapshot, useContactRecord } from "./use-contact-record";

type Fields = { name: string };

const id = crypto.randomUUID();

const initial = { id, version: 1, fields: { name: "Alice" } };

function setup({
  current = initial as RecordSnapshot<Fields> | null,
  save = vi.fn(async (fields: Fields, base: RecordSnapshot<Fields> | null) => ({
    id,
    fields,
    version: (base?.version ?? 0) + 1,
  })),
  enabled = true,
  externalSaving = false,
} = {}) {
  let editor: ReturnType<typeof useContactRecord<Fields>> | undefined;
  const onWork = vi.fn();
  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR hook harness.
  function Capture() {
    editor = useContactRecord({
      current,
      initial: { name: "" },
      enabled,
      externalSaving,
      save,
      validate: (fields) => {
        if (!fields.name.trim()) {
          throw Error("Name required");
        }
        return { name: fields.name.trim() };
      },
      onWork,
    });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) {
    throw Error("Missing editor");
  }
  return { editor, save, onWork };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("debounces, saves once and preserves focused whitespace without an autosave loop", async () => {
  const { editor, save } = setup();
  editor.change({ name: "Alice Smith " });
  await vi.advanceTimersByTimeAsync(600);
  expect(save).toHaveBeenCalledOnce();
  expect(editor.value.name).toBe("Alice Smith ");
  expect(editor.base?.fields.name).toBe("Alice Smith");
  expect(editor.hasChanges).toBe(false);
  await editor.flush();
  expect(save).toHaveBeenCalledOnce();
});
it("retains invalid edits, reports validation errors and discards to declared saved fields", async () => {
  const { editor, save } = setup();
  editor.change({ name: " " });
  expect(await editor.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(editor.hasChanges).toBe(true);
  expect(editor.value.name).toBe(" ");
  editor.discard();
  expect(editor.value).toEqual({ name: "Alice" });
  expect(editor.hasChanges).toBe(false);
});
it("keeps a failed write id stable for safe network retries", async () => {
  const save = vi.fn(
    async (_fields: Fields, _base: RecordSnapshot<Fields> | null) => {
      throw Error("Network failure");
    },
  );
  const { editor } = setup({ save });
  editor.change({ name: "Changed" });
  expect(await editor.flush()).toBe(false);
  expect(await editor.flush()).toBe(false);
  expect(save.mock.calls).toHaveLength(2);
  expect((save.mock.calls[0] as unknown[])[2]).toBe(
    (save.mock.calls[1] as unknown[])[2],
  );
  expect(editor.value.name).toBe("Changed");
});
it("retains concurrent conflict drafts until explicit reviewed replacement", async () => {
  const remote = { id, version: 2, fields: { name: "Remote" } };
  const save = vi
    .fn()
    .mockRejectedValueOnce(new ContactConflict(remote))
    .mockImplementation(
      async (fields: Fields, base: RecordSnapshot<Fields>) => ({
        id,
        fields,
        version: base.version + 1,
      }),
    );
  const { editor } = setup({ save });
  editor.change({ name: "Mine" });
  expect(await editor.flush()).toBe(false);
  expect(editor.value.name).toBe("Mine");
  expect(editor.conflict).toEqual(remote);
  await editor.flush();
  expect(save).toHaveBeenCalledOnce();
  editor.replace();
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]?.[1]?.version).toBe(2);
  expect(editor.base?.fields.name).toBe("Mine");
});
it("does not resurrect a remotely deleted record", async () => {
  const save = vi.fn().mockRejectedValue(new ContactConflict(null));
  const { editor } = setup({ save });
  editor.change({ name: "Mine" });
  await editor.flush();
  editor.replace();
  expect(save).toHaveBeenCalledOnce();
  expect(editor.hasChanges).toBe(true);
});
it("drains edits entered during an outstanding save using the acknowledged revision", async () => {
  let finish: ((r: RecordSnapshot<Fields>) => void) | undefined;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(
      async (fields: Fields, base: RecordSnapshot<Fields>) => ({
        id,
        fields,
        version: base.version + 1,
      }),
    );
  const { editor } = setup({ save });
  editor.change({ name: "First" });
  const pending = editor.flush();
  editor.change({ name: "Second" });
  finish?.({ id, fields: { name: "First" }, version: 2 });
  expect(await pending).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]?.[1]?.version).toBe(2);
  expect(editor.base?.fields.name).toBe("Second");
});
it("does not create an untouched empty draft and requires connectivity for a real change", async () => {
  const { editor, save } = setup({ current: null, enabled: false });
  expect(save).not.toHaveBeenCalled();
  editor.change({ name: "New contact" });
  expect(await editor.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(editor.hasChanges).toBe(true);
});

it("does not acknowledge an optimistic query echo before the queued server result", async () => {
  let resolve: (value: typeof initial) => void = () => undefined;
  const save = vi.fn(
    (_fields: Fields, _base: RecordSnapshot<Fields> | null) =>
      new Promise<typeof initial>((done) => {
        resolve = done;
      }),
  );
  const { editor } = setup({ save });
  editor.change({ name: "Queued" });
  const pending = editor.flush();
  const optimistic = { id, version: 2, fields: { name: "Queued" } };
  editor.reconcile(optimistic);
  expect(editor.base?.version).toBe(1);
  expect(editor.hasChanges).toBe(true);
  expect(editor.isSaving).toBe(true);
  resolve(optimistic);
  expect(await pending).toBe(true);
  expect(editor.base).toEqual(optimistic);
  expect(editor.hasChanges).toBe(false);
});

it("does not adopt an optimistic archive/unlink echo while its external mutation is pending", () => {
  const { editor } = setup({ externalSaving: true });
  editor.reconcile({ id, version: 2, fields: { name: "Optimistic only" } });
  expect(editor.base).toEqual(initial);
  expect(editor.value).toEqual(initial.fields);
});

it("reconciles same-version field changes from Zero rollback/rebase", () => {
  const { editor } = setup();
  editor.reconcile({ ...initial, fields: { name: "Rebased" } });
  expect(editor.value).toEqual({ name: "Rebased" });
});
