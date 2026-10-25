import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "./workout-log";
import {
  collectWorkoutSets,
  findDailyWorkoutLog,
  openWorkoutLog,
  setInputKey,
} from "./workout-log-form";

const workout = starterWorkouts[0];
if (!workout) throw new Error("seed");
const exercise = workout.exercises[0];
if (!exercise) throw new Error("seed");
describe("unsaved workout form", () => {
  it("starts empty without recording prescribed target values", () => {
    const form = openWorkoutLog(workout);
    expect(form.snapshot).not.toHaveProperty("notes");
    expect(form.inputs).toEqual({});
    expect(form).not.toHaveProperty("note");
    expect(form.completedAt).toBeNull();
    expect(collectWorkoutSets(form.snapshot.exercises, form.inputs)).toEqual({
      success: true,
      sets: [],
    });
  });
  it("records only entered rows, preserving blank-right semantics", () => {
    const form = openWorkoutLog(workout);
    const unilateral = workout.exercises.find((e) => e.unilateral);
    if (!unilateral) throw new Error("seed");
    form.inputs[setInputKey(unilateral.id, 1)] = {
      weightKg: "8",
      amount: "10",
      rightAmount: "",
    };
    expect(collectWorkoutSets(form.snapshot.exercises, form.inputs)).toEqual({
      success: true,
      sets: [
        {
          exerciseId: unilateral.id,
          round: 1,
          values: { weightKg: 8, amount: 10, rightAmount: null },
        },
      ],
    });
  });
  it("keeps incomplete rows and rejects Done rather than silently dropping them", () => {
    const form = openWorkoutLog(workout);
    form.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "8",
      amount: "",
      rightAmount: "",
    };
    expect(
      collectWorkoutSets(form.snapshot.exercises, form.inputs).success,
    ).toBe(false);
    expect(form.inputs[setInputKey(exercise.id, 1)]?.weightKg).toBe("8");
    form.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "",
      amount: "",
      rightAmount: "",
    };
    expect(collectWorkoutSets(form.snapshot.exercises, form.inputs)).toEqual({
      success: true,
      sets: [],
    });
  });
  it("does not restore anything after the form is discarded", () => {
    const discarded = openWorkoutLog(workout);
    discarded.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "8",
      amount: "10",
      rightAmount: "",
    };
    const next = openWorkoutLog(workout);
    expect(next.id).not.toBe(discarded.id);
    expect(next.inputs).toEqual({});
    expect(next).not.toHaveProperty("note");
  });
  it("edits a copy of existing history and preserves its historical definition", () => {
    const existing: WorkoutLog = {
      id: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
      workoutId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      snapshot: {
        title: workout.title,
        exercises: workout.exercises,
        notes: "Legacy copied notes",
      },
      note: "Original",
      createdAt: 1,
      completedAt: 2,
      completedOn: "2026-10-25",
      sets: [
        {
          logId: "log",
          exerciseId: exercise.id,
          round: 1,
          values: { weightKg: 8, amount: 10, rightAmount: null },
        },
      ],
    };
    expect(
      findDailyWorkoutLog(
        [existing],
        Date.parse("2026-10-25T23:30:00Z"),
        "UTC",
      ),
    ).toBe(existing);
    expect(
      findDailyWorkoutLog(
        [existing],
        Date.parse("2026-10-25T23:30:00Z"),
        "Europe/Brussels",
      ),
    ).toBeUndefined();
    const form = openWorkoutLog(
      { ...workout, title: "Changed workout" },
      existing,
    );
    expect(form.snapshot.title).toBe(workout.title);
    expect(form.snapshot).not.toHaveProperty("notes");
    expect(form.completedOn).toBe(existing.completedOn);
    expect(collectWorkoutSets(form.snapshot.exercises, form.inputs)).toEqual({
      success: true,
      sets: [
        {
          exerciseId: exercise.id,
          round: 1,
          values: { weightKg: 8, amount: 10, rightAmount: null },
        },
      ],
    });
    form.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "9",
      amount: "11",
      rightAmount: "",
    };
    expect(existing.note).toBe("Original");
    expect(existing.sets[0]?.values).toEqual({
      weightKg: 8,
      amount: 10,
      rightAmount: null,
    });
  });
});
