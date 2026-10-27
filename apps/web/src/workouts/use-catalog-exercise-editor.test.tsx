import type { CatalogExercise } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CatalogSaveResult,
  useCatalogExerciseEditor,
} from "./use-catalog-exercise-editor";

const existing: CatalogExercise = {
  id: crypto.randomUUID(),
  name: "Row",
  unit: "reps",
  load: "per-hand",
  unilateral: false,
};
const blank: CatalogExercise = {
  ...existing,
  id: crypto.randomUUID(),
  name: "",
};
function setup({
  initial = existing,
  current = (initial.name ? initial : undefined) as CatalogExercise | undefined,
  enabled = true,
  save = vi.fn(
    async (
      next: CatalogExercise,
      _previous: CatalogExercise | undefined,
    ): Promise<CatalogSaveResult> => ({ exercise: next }),
  ),
} = {}) {
  let editor: ReturnType<typeof useCatalogExerciseEditor> | undefined;
  const onSaved = vi.fn();
  function Capture() {
    editor = useCatalogExerciseEditor({
      initial,
      current,
      enabled,
      save,
      onSaved,
    });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) throw Error("editor");
  return { editor, save, onSaved };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("catalog autosave", () => {
  it("debounces names and saves only the latest text", async () => {
    const { editor, save } = setup();
    editor.change({ name: "Cable" });
    await vi.advanceTimersByTimeAsync(300);
    editor.change({ name: "Cable row" });
    await vi.advanceTimersByTimeAsync(599);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      { ...existing, name: "Cable row" },
      existing,
    );
  });
  it("keeps blank creation/settings local until a name is supplied", async () => {
    const { editor, save } = setup({ initial: blank, current: undefined });
    editor.change(
      { unit: "seconds", load: "bodyweight", unilateral: true },
      true,
    );
    await vi.runAllTimersAsync();
    expect(await editor.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    editor.change({ name: "Side plank" });
    expect(await editor.flush()).toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      {
        ...blank,
        name: "Side plank",
        unit: "seconds",
        load: "bodyweight",
        unilateral: true,
      },
      undefined,
    );
  });
  it("serializes saves and drains name/settings edits made during creation using the promoted ID", async () => {
    const promotedId = crypto.randomUUID();
    let finish: (r: CatalogSaveResult) => void = () => {};
    const first = new Promise<CatalogSaveResult>((resolve) => {
      finish = resolve;
    });
    const save = vi
      .fn(
        async (
          next: CatalogExercise,
          _previous: CatalogExercise | undefined,
        ): Promise<CatalogSaveResult> => ({ exercise: next }),
      )
      .mockImplementationOnce(() => first);
    const { editor, onSaved } = setup({
      initial: blank,
      current: undefined,
      save,
    });
    editor.change({ name: "Plank" }, true);
    await vi.advanceTimersByTimeAsync(0);
    editor.change(
      {
        name: "Side plank",
        unit: "seconds",
        load: "bodyweight",
        unilateral: true,
      },
      true,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    finish({ exercise: { ...blank, id: promotedId, name: "Plank" } });
    expect(await editor.flush()).toBe(true);
    expect(save.mock.calls[1]).toEqual([
      {
        ...blank,
        id: promotedId,
        name: "Side plank",
        unit: "seconds",
        load: "bodyweight",
        unilateral: true,
      },
      { ...blank, id: promotedId, name: "Plank" },
    ]);
    expect(onSaved).toHaveBeenLastCalledWith(promotedId);
  });
  it("saves discrete settings immediately and does not write unchanged fields again", async () => {
    const { editor, save } = setup();
    editor.change({ unit: "seconds", load: "bodyweight" }, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      { ...existing, unit: "seconds", load: "bodyweight" },
      existing,
    );
    expect(await editor.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("keeps failed drafts available for retry", async () => {
    const save = vi
      .fn(
        async (
          next: CatalogExercise,
          _previous: CatalogExercise | undefined,
        ): Promise<CatalogSaveResult> => ({ exercise: next }),
      )
      .mockResolvedValueOnce({ error: "Duplicate name" });
    const { editor } = setup({ save });
    editor.change({ name: "Cable row" });
    expect(await editor.flush()).toBe(false);
    expect(await editor.flush()).toBe(true);
    expect(save.mock.calls[1]?.[0].name).toBe("Cable row");
  });
  it("does not let an older failed save discard a corrected draft", async () => {
    let finish: (r: CatalogSaveResult) => void = () => {};
    const first = new Promise<CatalogSaveResult>((resolve) => {
      finish = resolve;
    });
    const save = vi
      .fn(
        async (
          next: CatalogExercise,
          _previous: CatalogExercise | undefined,
        ): Promise<CatalogSaveResult> => ({ exercise: next }),
      )
      .mockImplementationOnce(() => first);
    const { editor } = setup({ save });
    editor.change({ name: "Duplicate" }, true);
    await vi.advanceTimersByTimeAsync(0);
    editor.change({ name: "Different row" });
    finish({ error: "Duplicate name" });
    expect(await editor.flush()).toBe(true);
    expect(save.mock.calls[1]?.[0].name).toBe("Different row");
  });
  it("reverts unsaved names on Escape without writing them", async () => {
    const { editor, save } = setup();
    editor.change({ name: "Unsaved rename" });
    editor.revert();
    await vi.runAllTimersAsync();
    expect(await editor.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("never saves an empty existing name and restores it on blur", async () => {
    const { editor, save } = setup();
    editor.change({ name: "   " });
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    expect(await editor.flush()).toBe(false);
    expect(await editor.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("does not write while disconnected", async () => {
    const { editor, save } = setup({ enabled: false });
    editor.change({ name: "Cable row" }, true);
    await vi.runAllTimersAsync();
    expect(await editor.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
