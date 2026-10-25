import { describe, expect, it } from "vitest";
import { starterWorkouts } from "./workout-seed";
import {
  reorderWorkoutsSchema,
  saveWorkoutLogSchema,
  updateWorkoutSchema,
  workoutContentSchema,
  workoutExercisesSchema,
} from "./workouts";

describe("workouts", () => {
  it("ships three standalone workouts with one notes field", () => {
    expect(starterWorkouts.map((w) => w.title)).toEqual([
      "Workout A",
      "Workout B",
      "Workout C",
    ]);
    for (const workout of starterWorkouts) {
      expect(workoutContentSchema.parse(workout)).toEqual(workout);
      expect(Object.keys(workout).sort()).toEqual([
        "exercises",
        "notes",
        "title",
      ]);
      expect(workout.exercises).toHaveLength(6);
    }
  });
  it("allows an empty workout and rejects duplicate exercise identities", () => {
    expect(
      workoutContentSchema.safeParse({
        title: "Morning",
        notes: "",
        exercises: [],
      }).success,
    ).toBe(true);
    const e = starterWorkouts[0]?.exercises[0];
    if (!e) throw new Error("seed");
    expect(workoutExercisesSchema.safeParse([e, e]).success).toBe(false);
  });
  it("accepts scalar patches without requiring a whole workout", () => {
    const scope = {
      householdId: crypto.randomUUID(),
      workoutId: crypto.randomUUID(),
      optimisticTimestamp: 1,
    };
    expect(
      updateWorkoutSchema.parse({ ...scope, changes: { title: " A " } })
        .changes,
    ).toEqual({ title: "A" });
    expect(
      updateWorkoutSchema.safeParse({ ...scope, changes: {} }).success,
    ).toBe(false);
    expect(
      updateWorkoutSchema.safeParse({ ...scope, changes: { incrementKg: 1 } })
        .success,
    ).toBe(false);
  });
  it("rejects duplicate or incomplete workout orders", () => {
    const moved = crypto.randomUUID(),
      other = crypto.randomUUID();
    const args = {
      householdId: crypto.randomUUID(),
      workoutId: moved,
      optimisticTimestamp: 1,
    };
    expect(
      reorderWorkoutsSchema.safeParse({
        ...args,
        orderedWorkoutIds: [other, moved],
      }).success,
    ).toBe(true);
    expect(
      reorderWorkoutsSchema.safeParse({
        ...args,
        orderedWorkoutIds: [moved, moved],
      }).success,
    ).toBe(false);
    expect(
      reorderWorkoutsSchema.safeParse({ ...args, orderedWorkoutIds: [other] })
        .success,
    ).toBe(false);
  });
  it("validates a complete submission and rejects spoofed actors and duplicate sets", () => {
    const set = {
      exerciseId: crypto.randomUUID(),
      round: 1,
      values: { weightKg: 8, amount: 10, rightAmount: null },
    };
    const request = {
      householdId: crypto.randomUUID(),
      workoutId: crypto.randomUUID(),
      logId: crypto.randomUUID(),
      optimisticTimestamp: 1,
      snapshot: starterWorkouts[0],
      note: "",
      timeZone: "UTC",
      sets: [set],
    };
    expect(saveWorkoutLogSchema.safeParse(request).success).toBe(true);
    expect(
      saveWorkoutLogSchema.safeParse({
        ...request,
        userId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      saveWorkoutLogSchema.safeParse({ ...request, action: "start" }).success,
    ).toBe(false);
    expect(
      saveWorkoutLogSchema.safeParse({ ...request, sets: [set, set] }).success,
    ).toBe(false);
    for (const values of [
      { ...set.values, amount: -1 },
      { ...set.values, weightKg: -1 },
      { ...set.values, amount: 1.5 },
    ]) {
      expect(
        saveWorkoutLogSchema.safeParse({
          ...request,
          sets: [{ ...set, values }],
        }).success,
      ).toBe(false);
    }
  });
});
