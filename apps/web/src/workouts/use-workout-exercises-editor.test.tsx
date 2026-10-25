import { starterWorkouts } from "@home-hub/shared/workout-seed";
import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkoutExercisesEditor } from "./use-workout-exercises-editor";

const current = starterWorkouts[0]?.exercises ?? [];
function setup(
  save = vi.fn(async (_exercises: readonly WorkoutExercise[]) => true),
  enabled = true,
) {
  let editor: ReturnType<typeof useWorkoutExercisesEditor> | undefined;
  function Capture() {
    editor = useWorkoutExercisesEditor({ current, enabled, save });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) throw new Error("editor");
  return { editor, save };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("exercise autosave", () => {
  it("debounces typing and saves the latest draft without confirmation", async () => {
    const { editor, save } = setup();
    editor.change((rows) =>
      rows.map((e, i) => (i === 0 ? { ...e, target: "6" } : e)),
    );
    await vi.advanceTimersByTimeAsync(300);
    editor.change((rows) =>
      rows.map((e, i) => (i === 0 ? { ...e, target: "6–8" } : e)),
    );
    await vi.advanceTimersByTimeAsync(599);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0][0]?.target).toBe("6–8");
  });
  it("saves discrete changes immediately", async () => {
    const { editor, save } = setup();
    editor.change((rows) => rows.slice(1), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(current.slice(1));
  });
  it("serializes saves and drains changes typed while a save is pending", async () => {
    let resolve: (value: boolean) => void = () => {};
    const first = new Promise<boolean>((r) => {
      resolve = r;
    });
    const save = vi
      .fn(async (_exercises: readonly WorkoutExercise[]) => true)
      .mockImplementationOnce(() => first);
    const { editor } = setup(save);
    editor.change(
      (rows) => rows.map((e, i) => (i === 0 ? { ...e, target: "5" } : e)),
      true,
    );
    await vi.advanceTimersByTimeAsync(0);
    editor.change(
      (rows) => rows.map((e, i) => (i === 0 ? { ...e, target: "5–7" } : e)),
      true,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    resolve(true);
    expect(await editor.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0][0]?.target).toBe("5–7");
  });
  it("keeps rejected drafts available for retry", async () => {
    const save = vi
      .fn(async (_exercises: readonly WorkoutExercise[]) => true)
      .mockResolvedValueOnce(false);
    const { editor } = setup(save);
    editor.change((rows) => rows.slice(1));
    expect(await editor.flush()).toBe(false);
    expect(await editor.flush()).toBe(true);
    expect(save).toHaveBeenLastCalledWith(current.slice(1));
  });
  it("rejects invalid drafts without writing, then saves once corrected", async () => {
    const { editor, save } = setup();
    editor.change((rows) =>
      rows.map((e, i) => (i === 0 ? { ...e, sets: 0 } : e)),
    );
    expect(await editor.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    editor.change((rows) =>
      rows.map((e, i) => (i === 0 ? { ...e, sets: 3 } : e)),
    );
    expect(await editor.flush()).toBe(true);
    expect(save.mock.calls[0]?.[0][0]?.sets).toBe(3);
  });
  it("does not write while disconnected", async () => {
    const { editor, save } = setup(undefined, false);
    editor.change((rows) => rows.slice(1), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(await editor.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
