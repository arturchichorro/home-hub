import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type CalendarDraft,
  type CalendarSaveResult,
  useCalendarEditor,
} from "./use-calendar-editor";

const existing: CalendarDraft = {
  title: "Dinner",
  note: "Old note",
  day: "2026-11-11",
  people: [],
};
const blank: CalendarDraft = { ...existing, title: "", note: "" };
function setup({
  initial = existing,
  current = (initial.title ? initial : undefined) as CalendarDraft | undefined,
  enabled = true,
  save = vi.fn(
    async (
      next: CalendarDraft,
      _previous: CalendarDraft | undefined,
    ): Promise<CalendarSaveResult> => ({ confirmed: next }),
  ),
} = {}) {
  let editor: ReturnType<typeof useCalendarEditor> | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR harness, not a recreated mounted subtree.
  function Capture() {
    editor = useCalendarEditor({ initial, current, enabled, save });
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

it("creates nothing for an untouched empty dialog", async () => {
  const { editor, save } = setup({ initial: blank, current: undefined });
  expect(await editor.flush()).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
it("keeps notes/people local until a valid title and preserves multiline content", async () => {
  const { editor, save } = setup({ initial: blank, current: undefined });
  const person = crypto.randomUUID();
  editor.change({ note: "First\nSecond", people: [person] }, true);
  await vi.runAllTimersAsync();
  expect(save).not.toHaveBeenCalled();
  expect(await editor.flush()).toBe(false);
  editor.change({ title: "  Dinner " });
  await vi.advanceTimersByTimeAsync(600);
  expect(save).toHaveBeenCalledExactlyOnceWith(
    { ...blank, title: "Dinner", note: "First\nSecond", people: [person] },
    undefined,
  );
});
it("debounces text and flushes date changes immediately without resaving unchanged fields", async () => {
  const { editor, save } = setup();
  editor.change({ note: "One" });
  await vi.advanceTimersByTimeAsync(300);
  editor.change({ note: "Two" });
  await vi.advanceTimersByTimeAsync(599);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  editor.change({ day: "2026-12-01" }, true);
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual([
    { ...existing, note: "Two", day: "2026-12-01" },
    { ...existing, note: "Two" },
  ]);
  expect(await editor.flush()).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
});
it("serializes creation and drains edits made during the first request without creating twice", async () => {
  let finish: (result: CalendarSaveResult) => void = () => {};
  const first = new Promise<CalendarSaveResult>((resolve) => {
    finish = resolve;
  });
  const save = vi
    .fn(
      async (
        next: CalendarDraft,
        _previous: CalendarDraft | undefined,
      ): Promise<CalendarSaveResult> => ({ confirmed: next }),
    )
    .mockImplementationOnce(() => first);
  const { editor } = setup({ initial: blank, current: undefined, save });
  editor.change({ title: "Dinner" }, true);
  await vi.advanceTimersByTimeAsync(0);
  editor.change({ note: "Arrive early", day: "2026-12-01" }, true);
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(1);
  finish({ confirmed: { ...blank, title: "Dinner" } });
  expect(await editor.flush()).toBe(true);
  expect(save.mock.calls[1]).toEqual([
    { ...blank, title: "Dinner", note: "Arrive early", day: "2026-12-01" },
    { ...blank, title: "Dinner" },
  ]);
});
it("retains failures for retry and drops only unsaved edits on discard", async () => {
  const save = vi
    .fn(
      async (
        next: CalendarDraft,
        _previous: CalendarDraft | undefined,
      ): Promise<CalendarSaveResult> => ({ confirmed: next }),
    )
    .mockResolvedValueOnce({ confirmed: existing, error: "Rejected" });
  const { editor } = setup({ save });
  editor.change({ title: "New title" });
  expect(await editor.flush()).toBe(false);
  expect(await editor.flush()).toBe(true);
  expect(save.mock.calls[1]?.[0].title).toBe("New title");
  editor.change({ note: "Discard only this" });
  editor.discard();
  expect(await editor.flush()).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
});
it("tracks partial creation success so a failed people write cannot cause duplicate creation", async () => {
  const partial = { ...blank, title: "Dinner" };
  const save = vi
    .fn(
      async (
        next: CalendarDraft,
        _previous: CalendarDraft | undefined,
      ): Promise<CalendarSaveResult> => ({ confirmed: next }),
    )
    .mockResolvedValueOnce({ confirmed: partial, error: "People rejected" });
  const { editor } = setup({ initial: blank, current: undefined, save });
  editor.change({ title: "Dinner", people: [crypto.randomUUID()] });
  expect(await editor.flush()).toBe(false);
  expect(await editor.flush()).toBe(true);
  expect(save.mock.calls[1]?.[1]).toEqual(partial);
});
it("retains invalid/cleared titles and offline edits without writing or deleting", async () => {
  const { editor, save } = setup();
  editor.change({ title: "" });
  expect(await editor.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  editor.discard();
  expect(await editor.flush()).toBe(true);
  const offline = setup({ enabled: false });
  offline.editor.change({ note: "Offline draft" });
  expect(await offline.editor.flush()).toBe(false);
  expect(offline.save).not.toHaveBeenCalled();
});
it("treats rejected promises as retained failed drafts", async () => {
  const save = vi.fn(
    async (
      _next: CalendarDraft,
      _previous: CalendarDraft | undefined,
    ): Promise<CalendarSaveResult> => {
      throw Error("Transport");
    },
  );
  const { editor } = setup({ save });
  editor.change({ note: "Keep this" });
  expect(await editor.flush()).toBe(false);
  expect(await editor.flush()).toBe(false);
  expect(save).toHaveBeenCalledTimes(2);
});
