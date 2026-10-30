import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "./workout-log";
import {
  completeSetValues,
  findDailyWorkoutLog,
  openWorkoutLog,
  setInputKey,
} from "./workout-log-form";

const workout = starterWorkouts[0];
if (!workout) throw Error("seed");
const exercise = workout.exercises[0];
if (!exercise) throw Error("seed");
describe("workout logging inputs", () => {
  it("starts empty without copying shared notes, targets or previous values", () => {
    const form = openWorkoutLog(workout);
    expect(form.snapshot).not.toHaveProperty("notes");
    expect(form).not.toHaveProperty("note");
    expect(form.inputs).toEqual({});
    expect(form.completedAt).toBeNull();
    expect(form.completedOn).toBeNull();
  });
  it("requires both unilateral counts rather than interpreting a new blank as left", () => {
    const unilateral = workout.exercises.find((e) => e.unilateral);
    if (!unilateral) throw Error("seed");
    expect(
      completeSetValues(unilateral, {
        weightKg: "8",
        amount: "10",
        rightAmount: "",
      }),
    ).toBeUndefined();
    expect(
      completeSetValues(unilateral, {
        weightKg: "8",
        amount: "10",
        rightAmount: "9",
      }),
    ).toEqual({ weightKg: 8, amount: 10, rightAmount: 9 });
  });
  it("retains incomplete text without treating it as a saved row", () => {
    const form = openWorkoutLog(workout),
      input = { weightKg: "8", amount: "", rightAmount: "" };
    form.inputs[setInputKey(exercise.id, 1)] = input;
    expect(completeSetValues(exercise, input)).toBeUndefined();
    expect(input.weightKg).toBe("8");
    expect(form.completedAt).toBeNull();
  });
  it("does not restore discarded, incomplete text into a new form", () => {
    const old = openWorkoutLog(workout);
    old.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "8",
      amount: "",
      rightAmount: "",
    };
    const next = openWorkoutLog(workout);
    expect(next.id).not.toBe(old.id);
    expect(next.inputs).toEqual({});
  });
  it("opens original snapshots and numeric values without mutating history or private notes", () => {
    const existing: WorkoutLog = {
      id: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
      workoutId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      snapshot: { ...workout, notes: "Legacy copied notes" },
      note: "Private",
      createdAt: 1,
      completedAt: 2,
      completedOn: "2026-10-25",
      sets: [
        {
          logId: "log",
          householdId: crypto.randomUUID(),
          workoutExerciseId: exercise.id,
          exerciseId: exercise.catalogExerciseId ?? exercise.id,
          round: 1,
          amount: 10,
          weightKg: 8,
          rightAmount: null,
          unit: exercise.unit,
          load: exercise.load,
          unilateral: exercise.unilateral,
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
    const form = openWorkoutLog({ ...workout, title: "Changed" }, existing);
    expect(form.id).toBe(existing.id);
    expect(form.snapshot.title).toBe(workout.title);
    expect(form.snapshot).not.toHaveProperty("notes");
    expect(
      completeSetValues(exercise, form.inputs[setInputKey(exercise.id, 1)]),
    ).toEqual({ weightKg: 8, amount: 10, rightAmount: null });
    form.inputs[setInputKey(exercise.id, 1)] = {
      weightKg: "9",
      amount: "11",
      rightAmount: "",
    };
    expect(existing.note).toBe("Private");
    expect(existing.sets[0]).toMatchObject({ amount: 10, weightKg: 8 });
  });
});
