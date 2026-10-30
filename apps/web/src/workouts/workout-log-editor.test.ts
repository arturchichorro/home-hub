import type { SaveExerciseSet } from "@home-hub/shared/exercise-logs";
import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkoutLog } from "./workout-log";
import { WorkoutLogEditor } from "./workout-log-editor";
import {
  completeSetValues,
  exerciseRoundCount,
  exerciseRounds,
  openWorkoutLog,
  setInputKey,
} from "./workout-log-form";

const exercise: WorkoutExercise = {
  id: crypto.randomUUID(),
  catalogExerciseId: crypto.randomUUID(),
  name: "Row",
  unit: "reps",
  load: "per-hand",
  unilateral: false,
  sets: 2,
  target: "8–12",
};
const householdId = crypto.randomUUID(),
  workoutId = crypto.randomUUID(),
  userId = crypto.randomUUID();
const editors: WorkoutLogEditor[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const editor of editors.splice(0)) editor.dispose();
  vi.useRealTimers();
});
function savedLog(overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: crypto.randomUUID(),
    householdId,
    workoutId,
    userId,
    note: "Private",
    createdAt: 10,
    completedAt: 20,
    completedOn: "2026-10-20",
    snapshot: { title: "Original", exercises: [exercise] },
    sets: [
      {
        logId: "unused",
        householdId,
        workoutExerciseId: exercise.id,
        exerciseId: exercise.catalogExerciseId ?? "",
        round: 1,
        amount: 12,
        weightKg: 8,
        rightAmount: null,
        unit: "reps",
        load: "per-hand",
        unilateral: false,
      },
    ],
    ...overrides,
  };
}
function setup(
  options: {
    exercises?: WorkoutExercise[];
    existing?: WorkoutLog;
    onSave?: (args: SaveExerciseSet) => Promise<boolean>;
    onRemove?: () => Promise<boolean>;
    enabled?: () => boolean;
  } = {},
) {
  const save = vi.fn(async (args: SaveExerciseSet) =>
    options.onSave ? options.onSave(args) : true,
  );
  const remove = vi.fn(async () =>
    options.onRemove ? options.onRemove() : true,
  );
  const form = openWorkoutLog(
    { title: "Workout", exercises: options.exercises ?? [exercise] },
    options.existing,
  );
  const editor = new WorkoutLogEditor(form, {
    householdId,
    workoutId,
    timeZone: "UTC",
    enabled: options.enabled ?? (() => true),
    save,
    remove,
  });
  editors.push(editor);
  return { editor, save, remove };
}
const fill = (editor: WorkoutLogEditor, round = 1, patch = {}) =>
  editor.change(exercise.id, round, {
    weightKg: "8",
    amount: "12",
    rightAmount: "",
    ...patch,
  });
it("publishes its day while saving so a concurrent device's canonical header can reconcile", async () => {
  let finish: (ok: boolean) => void = () => {};
  const { editor } = setup({
    onSave: () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  });
  fill(editor);
  const pending = editor.flush();
  await vi.advanceTimersByTimeAsync(0);
  const form = editor.getSnapshot().form;
  expect(form.completedOn).not.toBeNull();
  const old = savedLog(),
    set = old.sets[0];
  if (!set) throw Error("fixture");
  const canonical = savedLog({
    id: crypto.randomUUID(),
    completedOn: form.completedOn ?? "",
    completedAt: form.completedAt ?? 0,
    sets: [{ ...set, round: 2, amount: 7 }],
  });
  editor.sync(canonical);
  expect(editor.getSnapshot().form.id).toBe(canonical.id);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 2)]?.amount,
  ).toBe("7");
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("12");
  finish(true);
  await pending;
  expect(editor.getSnapshot().hasChanges).toBe(false);
});
it("reconciles canonical occurrence IDs even if the measurements did not change", () => {
  const log = savedLog(),
    id = crypto.randomUUID(),
    { editor } = setup({ existing: log });
  editor.sync({ ...log, exerciseLogIds: { [exercise.id]: id } });
  expect(editor.getSnapshot().form.exerciseLogIds?.[exercise.id]).toBe(id);
});
it("removes a clean optional row when another device removes that recorded set", () => {
  const log = savedLog(),
    set = log.sets[0];
  if (!set) throw Error("fixture");
  const { editor } = setup({
    existing: { ...log, sets: [set, { ...set, round: 3 }] },
  });
  editor.sync(log);
  expect(exerciseRoundCount(exercise, editor.getSnapshot().form.inputs)).toBe(
    2,
  );
});
it("preserves typed numeric formatting when the acknowledged row synchronizes", async () => {
  const log = savedLog(),
    { editor } = setup({ existing: log });
  fill(editor, 1, { weightKg: "8.000" });
  await editor.flush();
  editor.sync(log);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.weightKg,
  ).toBe("8.000");
  expect(editor.getSnapshot().hasChanges).toBe(false);
});
it("does not suppress remote legacy corrections when both rows have a missing weight", () => {
  const log = savedLog(),
    set = log.sets[0];
  if (!set) throw Error("fixture");
  const old = { ...log, sets: [{ ...set, weightKg: null }] },
    { editor } = setup({ existing: old });
  editor.sync({ ...old, sets: [{ ...set, weightKg: null, amount: 13 }] });
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("13");
});
it("saves a complete row after the pause without resetting its text or closing the form", async () => {
  const { editor, save } = setup();
  fill(editor);
  await vi.advanceTimersByTimeAsync(599);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await editor.flush();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0].values).toEqual({
    weightKg: 8,
    amount: 12,
    rightAmount: null,
  });
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("12");
  expect(editor.getSnapshot().hasChanges).toBe(false);
  expect(editor.getSnapshot().headerConfirmed).toBe(true);
  fill(editor);
  await editor.flush();
  expect(save).toHaveBeenCalledTimes(1);
});
it("flushes valid rows immediately on blur/Enter", async () => {
  const { editor, save } = setup();
  fill(editor);
  await editor.flush(exercise.id, 1);
  expect(save).toHaveBeenCalledTimes(1);
});
it("requires explicit weight and both unilateral counts, including valid zeros", async () => {
  const unilateral = { ...exercise, unilateral: true };
  const { editor, save } = setup({ exercises: [unilateral] });
  fill(editor, 1, { weightKg: "", amount: "0" });
  await vi.advanceTimersByTimeAsync(700);
  expect(save).not.toHaveBeenCalled();
  editor.change(exercise.id, 1, { weightKg: "0" });
  await editor.flush();
  expect(save).not.toHaveBeenCalled();
  editor.change(exercise.id, 1, { rightAmount: "0" });
  await editor.flush();
  expect(save.mock.calls[0]?.[0].values).toEqual({
    weightKg: 0,
    amount: 0,
    rightAmount: 0,
  });
});
it("a partial row does not block a different complete row", async () => {
  const other = {
    ...exercise,
    id: crypto.randomUUID(),
    catalogExerciseId: crypto.randomUUID(),
  };
  const { editor, save } = setup({ exercises: [exercise, other] });
  editor.change(exercise.id, 1, { amount: "10" });
  editor.change(other.id, 1, { amount: "8", weightKg: "15" });
  await editor.flush();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0].workoutExerciseId).toBe(other.id);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("10");
  expect(editor.getSnapshot().hasChanges).toBe(true);
});
it("bodyweight needs no weight and invalid amounts never save", async () => {
  const bodyweight = { ...exercise, load: "bodyweight" as const };
  expect(
    completeSetValues(bodyweight, {
      weightKg: "",
      amount: "12",
      rightAmount: "",
    })?.weightKg,
  ).toBeNull();
  for (const amount of ["", "-1", "12.5", "601", "NaN"]) {
    const { editor, save } = setup();
    fill(editor, 1, { amount });
    await editor.flush();
    expect(save).not.toHaveBeenCalled();
  }
});
it("keeps edits typed during a pending save, then drains the latest complete version", async () => {
  let finish: (value: boolean) => void = () => {};
  let first = true;
  const { editor, save } = setup({
    onSave: async () => {
      if (!first) return true;
      first = false;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    },
  });
  fill(editor);
  const pending = editor.flush();
  await vi.advanceTimersByTimeAsync(0);
  fill(editor, 1, { amount: "15" });
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("15");
  finish(true);
  await pending;
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]?.[0].values.amount).toBe(15);
  expect(editor.getSnapshot().hasChanges).toBe(false);
});
it("retains a failed save and retries the latest text rather than reverting it", async () => {
  let success = false;
  const { editor, save } = setup({ onSave: async () => success });
  fill(editor);
  await editor.flush();
  expect(editor.getSnapshot().errors[setInputKey(exercise.id, 1)]).toContain(
    "still here",
  );
  expect(editor.getSnapshot().hasChanges).toBe(true);
  fill(editor, 1, { amount: "14" });
  success = true;
  await editor.flush();
  expect(save.mock.calls.at(-1)?.[0].values.amount).toBe(14);
  expect(editor.getSnapshot().hasChanges).toBe(false);
});
it("clearing a saved field is an unsaved edit, not a deletion", async () => {
  const existing = savedLog();
  const { editor, save, remove } = setup({ existing });
  editor.change(exercise.id, 1, { weightKg: "" });
  await editor.flush();
  expect(save).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(editor.getSnapshot().hasChanges).toBe(true);
  editor.sync(existing);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.weightKg,
  ).toBe("");
});
it("adds extra sets only after the displayed rows are complete and never changes the prescription", async () => {
  const { editor, save } = setup();
  editor.addSet(exercise.id);
  expect(exerciseRoundCount(exercise, editor.getSnapshot().form.inputs)).toBe(
    2,
  );
  fill(editor, 1);
  fill(editor, 2);
  editor.addSet(exercise.id);
  expect(exerciseRoundCount(exercise, editor.getSnapshot().form.inputs)).toBe(
    3,
  );
  expect(editor.getSnapshot().form.snapshot.exercises[0]?.sets).toBe(2);
  fill(editor, 3);
  await editor.flush();
  expect(save.mock.calls.map((c) => c[0].round)).toEqual([1, 2, 3]);
});
it("can reuse a removed optional round at the ten-round limit without renumbering other sets", async () => {
  const { editor } = setup();
  for (let round = 1; round <= 10; round++) {
    fill(editor, round);
    if (round >= 2 && round < 10) editor.addSet(exercise.id);
  }
  await editor.flush();
  expect(editor.getSnapshot().recorded.size).toBe(10);
  await editor.removeSet(exercise.id, 3);
  expect(editor.getSnapshot().recorded.size).toBe(9);
  editor.addSet(exercise.id);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 3)]?.amount,
  ).toBe("");
  fill(editor, 3, { amount: "7" });
  await editor.flush();
  expect(editor.getSnapshot().recorded.size).toBe(10);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 10)]?.amount,
  ).toBe("12");
  expect(editor.getSnapshot().form.snapshot.exercises[0]?.sets).toBe(2);
});
it("removes a recorded set explicitly without removing any other set or changing its date", async () => {
  const { editor, remove } = setup({ existing: savedLog() });
  await editor.removeSet(exercise.id, 1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)],
  ).toBeUndefined();
  expect(editor.getSnapshot().form.completedOn).toBe("2026-10-20");
});
it("does not lose the saved row when deletion fails", async () => {
  const { editor } = setup({
    existing: savedLog(),
    onRemove: async () => false,
  });
  await editor.removeSet(exercise.id, 1);
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("12");
  expect(editor.getSnapshot().errors[setInputKey(exercise.id, 1)]).toContain(
    "remove",
  );
});
it("hydrates extra sets after reopening, and skips removed optional rounds without renumbering history", () => {
  const log = savedLog();
  const set = log.sets[0];
  if (!set) throw Error("fixture");
  const reopened = openWorkoutLog(
    { title: "New", exercises: [exercise] },
    { ...log, sets: [set, { ...set, round: 4 }] },
  );
  expect(exerciseRoundCount(exercise, reopened.inputs)).toBe(4);
  expect(exerciseRounds(exercise, reopened.inputs)).toEqual([1, 2, 4]);
});
it("updates untouched rows from another device without overwriting an incomplete local row", () => {
  const log = savedLog(),
    first = log.sets[0];
  if (!first) throw Error("fixture");
  const { editor } = setup({ existing: log });
  editor.change(exercise.id, 1, { weightKg: "" });
  editor.sync({
    ...log,
    sets: [
      { ...first, amount: 99 },
      { ...first, round: 2, amount: 7 },
    ],
  });
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 1)]?.amount,
  ).toBe("12");
  expect(
    editor.getSnapshot().form.inputs[setInputKey(exercise.id, 2)]?.amount,
  ).toBe("7");
});
it("interprets legacy blank-right as the historical left value without mutating the stored row", () => {
  const unilateral = { ...exercise, unilateral: true },
    log = savedLog({ snapshot: { title: "Old", exercises: [unilateral] } }),
    set = log.sets[0];
  if (!set) throw Error("fixture");
  const old = {
    ...log,
    sets: [{ ...set, unilateral: true, rightAmount: null }],
  };
  const form = openWorkoutLog({ title: "Today", exercises: [unilateral] }, old);
  expect(form.inputs[setInputKey(exercise.id, 1)]?.rightAmount).toBe("12");
  expect(old.sets[0]?.rightAmount).toBeNull();
});
it("keeps historical dates and original definitions during autosaved corrections", async () => {
  const log = savedLog(),
    { editor, save } = setup({ existing: log });
  fill(editor, 1, { amount: "14" });
  await editor.flush();
  const args = save.mock.calls[0]?.[0];
  expect(args?.logId).toBe(log.id);
  expect(args?.completedOn).toBe(log.completedOn);
  expect(args?.optimisticTimestamp).toBe(log.completedAt);
  expect(args?.snapshot.title).toBe("Original");
});
it("keeps a complete edit pending if an app update or access guard disables writes", async () => {
  let enabled = false;
  const { editor, save } = setup({ enabled: () => enabled });
  fill(editor);
  await editor.flush();
  expect(save).not.toHaveBeenCalled();
  expect(editor.getSnapshot().hasChanges).toBe(true);
  enabled = true;
  await editor.flush();
  expect(save).toHaveBeenCalledTimes(1);
});
