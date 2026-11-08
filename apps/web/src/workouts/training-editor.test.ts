import type { SaveTrainingSet } from "@home-hub/shared/training";
import { logOnlyWorkoutExercise } from "@home-hub/shared/training";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkoutLog } from "./workout-log";
import { WorkoutLogEditor } from "./workout-log-editor";
import { openWorkoutLog, type WorkoutLogForm } from "./workout-log-form";

const householdId = crypto.randomUUID();
const userId = crypto.randomUUID();
const editors: WorkoutLogEditor<null>[] = [];
const catalog = (name: string, unilateral = false) => ({
  id: crypto.randomUUID(),
  name,
  unit: "reps" as const,
  load: "bodyweight" as const,
  unilateral,
});
const a = catalog("A");
const b = catalog("B");
type Save = (
  args: Omit<SaveTrainingSet, "workoutId"> & { workoutId: null },
) => Promise<boolean>;
function setup(onSave?: Save) {
  const save = vi.fn<Save>(onSave ?? (async () => true));
  const editor = new WorkoutLogEditor<null>(
    openWorkoutLog({ title: "Free training", exercises: [] }),
    {
      householdId,
      workoutId: null,
      timeZone: "UTC",
      enabled: () => true,
      save,
      remove: async () => true,
    },
  );
  editors.push(editor);
  return { editor, save };
}
const fill = (
  editor: WorkoutLogEditor<null>,
  id: string,
  amount = "0",
  rightAmount = "",
) => editor.change(id, 1, { amount, rightAmount, weightKg: "" });
function optimistic(form: WorkoutLogForm): WorkoutLog {
  return {
    id: form.id,
    householdId,
    workoutId: null,
    userId,
    note: "",
    completedOn: "2026-11-08",
    completedAt: Date.now(),
    createdAt: Date.now(),
    snapshot: form.snapshot,
    sessionExerciseIds: form.sessionExerciseIds ?? {},
    logOnlyExerciseIds: form.logOnlyExerciseIds ?? [],
    sets: [],
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T23:59:59Z"));
});
afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.dispose();
  }
  vi.useRealTimers();
});

it("guards local selections without creating a log and saves every selection in added order even when B is logged first", async () => {
  const { editor, save } = setup();
  editor.addExercise(a);
  editor.addExercise(b);
  editor.addExercise(a);
  expect(save).not.toHaveBeenCalled();
  expect(editor.getSnapshot().hasChanges).toBe(true);
  fill(editor, b.id);
  await editor.flush(b.id, 1);
  const call = save.mock.calls[0];
  expect(call?.[0].exercises.map((row) => row.catalogExerciseId)).toEqual([
    a.id,
    b.id,
  ]);
  expect(call?.[0].exercises.every((row) => row.isNew)).toBe(true);
  expect(call?.[0].workoutId).toBeNull();
  expect(editor.getSnapshot().headerConfirmed).toBe(true);
  expect(editor.getSnapshot().hasChanges).toBe(false);
  expect(editor.getSnapshot().recorded.size).toBe(1);
});

it("retains selections and values after failure, ignores an unacknowledged optimistic header, and retries with stable identities on the new day", async () => {
  let controller: WorkoutLogEditor<null>;
  let fail = true;
  const { editor, save } = setup(async () => {
    controller.sync(optimistic(controller.getSnapshot().form));
    return !fail;
  });
  controller = editor;
  editor.addExercise(a);
  editor.addExercise(b);
  const ids = { ...editor.getSnapshot().form.sessionExerciseIds };
  fill(editor, b.id);
  await editor.flush(b.id, 1);
  expect(editor.getSnapshot().headerConfirmed).toBe(false);
  expect(editor.getSnapshot().form.completedAt).toBeNull();
  expect(editor.getSnapshot().hasChanges).toBe(true);
  expect(editor.getSnapshot().form.inputs[`${b.id}:1`]?.amount).toBe("0");
  fail = false;
  vi.setSystemTime(new Date("2026-11-09T00:00:01Z"));
  await editor.flush(b.id, 1);
  expect(save.mock.calls[1]?.[0].completedOn).toBe("2026-11-09");
  expect(save.mock.calls[1]?.[0].exercises.every((row) => row.isNew)).toBe(
    true,
  );
  expect(editor.getSnapshot().form.sessionExerciseIds).toEqual(ids);
  expect(editor.getSnapshot().hasChanges).toBe(false);
});

it("keeps exercises added while a set save is in flight as guarded drafts", async () => {
  let finish: ((saved: boolean) => void) | undefined;
  let first = true;
  const { editor, save } = setup(async () => {
    if (!first) {
      return true;
    }
    first = false;
    return new Promise<boolean>((resolve) => {
      finish = resolve;
    });
  });
  editor.addExercise(a);
  editor.addExercise(b);
  fill(editor, b.id);
  const pending = editor.flush(b.id, 1);
  await Promise.resolve();
  await Promise.resolve();
  const c = catalog("C");
  editor.addExercise(c);
  if (!finish) {
    throw Error("Expected an in-flight save");
  }
  finish(true);
  await pending;
  expect(editor.getSnapshot().hasChanges).toBe(true);
  expect(
    save.mock.calls[0]?.[0].exercises.map((row) => row.catalogExerciseId),
  ).toEqual([a.id, b.id]);
  fill(editor, c.id);
  await editor.flush(c.id, 1);
  expect(
    save.mock.calls[1]?.[0].exercises
      .filter((row) => row.isNew)
      .map((row) => row.catalogExerciseId),
  ).toEqual([c.id]);
  expect(editor.getSnapshot().hasChanges).toBe(false);
});

it("reconciles a canonical daily identity without overwriting dirty inputs or producing a fake parent workout", async () => {
  const { editor } = setup();
  editor.addExercise(a);
  fill(editor, a.id, "5");
  const id = crypto.randomUUID();
  const occurrence = crypto.randomUUID();
  const log = {
    ...optimistic(editor.getSnapshot().form),
    id,
    completedAt: 100,
    sessionExerciseIds: { [a.id]: occurrence },
  };
  editor.sync(log);
  expect(editor.getSnapshot().form.id).toBe(id);
  expect(editor.getSnapshot().form.sessionExerciseIds?.[a.id]).toBe(occurrence);
  expect(editor.getSnapshot().form.inputs[`${a.id}:1`]?.amount).toBe("5");
  expect(editor.getSnapshot().hasChanges).toBe(true);
});

it("requires both sides of a unilateral set and accepts zero as a complete amount", async () => {
  const { editor, save } = setup();
  const single = catalog("Unilateral", true);
  editor.addExercise(single);
  fill(editor, single.id);
  await editor.flush(single.id, 1);
  expect(save).not.toHaveBeenCalled();
  expect(editor.getSnapshot().hasChanges).toBe(true);
  fill(editor, single.id, "0", "0");
  await editor.flush(single.id, 1);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[0].values).toMatchObject({
    amount: 0,
    rightAmount: 0,
  });
});

it("can discard a selected exercise and its timers without deleting the catalog or another row's draft", async () => {
  const { editor, save } = setup();
  editor.addExercise(a);
  editor.addExercise(b);
  fill(editor, a.id, "4");
  fill(editor, b.id, "7");
  expect(editor.discardExercise(a.id)).toBe(true);
  expect(
    editor.getSnapshot().form.snapshot.exercises.map((row) => row.id),
  ).toEqual([b.id]);
  expect(editor.getSnapshot().form.sessionExerciseIds?.[a.id]).toBeUndefined();
  expect(editor.getSnapshot().form.inputs[`${a.id}:1`]).toBeUndefined();
  expect(editor.getSnapshot().form.inputs[`${b.id}:1`]?.amount).toBe("7");
  expect(editor.getSnapshot().hasChanges).toBe(true);
  expect(editor.discardExercise(b.id)).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(save).not.toHaveBeenCalled();
  expect(editor.getSnapshot().hasChanges).toBe(false);
});

it("enforces the forty-exercise limit and does not persist a mere selection", () => {
  const { editor, save } = setup();
  for (let index = 0; index < 40; index++) {
    editor.addExercise(catalog(String(index)));
  }
  editor.addExercise(catalog("Overflow"));
  expect(editor.getSnapshot().form.snapshot.exercises).toHaveLength(40);
  expect(save).not.toHaveBeenCalled();
});

it("reattaches the same controller after StrictMode effect cleanup without losing its draft or disabling writes", async () => {
  const { editor, save } = setup();

  editor.addExercise(a);
  editor.dispose();
  editor.activate();
  fill(editor, a.id, "3");
  await editor.flush(a.id, 1);

  expect(save).toHaveBeenCalledOnce();
  expect(editor.getSnapshot().form.inputs[`${a.id}:1`]?.amount).toBe("3");
});

it("lets an already-sent set finish after discard without sending a newer discarded edit", async () => {
  let finish: ((value: boolean) => void) | undefined;
  const { editor, save } = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );

  editor.addExercise(a);
  fill(editor, a.id, "3");
  const pending = editor.flush(a.id, 1);
  await Promise.resolve();
  await Promise.resolve();
  fill(editor, a.id, "8");
  editor.dispose();

  if (!finish) {
    throw Error("Expected an in-flight save");
  }

  finish(true);
  await pending;

  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[0].values.amount).toBe(3);
});

it("uses catalog identity rather than any fabricated workout-template slot", () => {
  const definition = logOnlyWorkoutExercise(a);
  expect(definition.id).toBe(a.id);
  expect(definition.catalogExerciseId).toBe(a.id);
});
