import { expect, it } from "vitest";
import {
  exerciseCatalogSchema,
  planExerciseEdits,
  workoutExerciseRoleSchema,
  workoutExerciseSchema,
  workoutExercisesFromRows,
  workoutLogSnapshotSchema,
  workoutSnapshotWithoutRoles,
} from "./workouts";

const exercise = {
  id: crypto.randomUUID(),
  name: "Squat",
  unit: "reps" as const,
  load: "single" as const,
  unilateral: false,
  sets: 3,
  target: "8–12",
};
it("accepts exactly the three roles and keeps catalog identity independent", () => {
  for (const role of ["warmup", "workout", "stretching"])
    expect(workoutExerciseRoleSchema.safeParse(role).success).toBe(true);
  expect(workoutExerciseRoleSchema.safeParse("accessory").success).toBe(false);
  expect(
    exerciseCatalogSchema.safeParse({
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      load: exercise.load,
      unilateral: false,
      role: "warmup",
    }).success,
  ).toBe(false);
});
it("sends only the changed placement role, not shared catalog settings", () => {
  expect(
    planExerciseEdits([exercise], [{ ...exercise, role: "warmup" }]),
  ).toEqual({
    creates: [],
    deletes: [],
    updates: [{ exerciseId: exercise.id, changes: { role: "warmup" } }],
  });
});
it("persists old-reader-compatible definition JSON while roles are snapshotted separately", () => {
  const snapshot = workoutSnapshotWithoutRoles({
    title: "New",
    exercises: [{ ...exercise, role: "warmup" }],
  });
  expect(snapshot.exercises[0]).not.toHaveProperty("role");
  expect(
    workoutExerciseSchema
      .omit({ role: true })
      .strict()
      .safeParse(snapshot.exercises[0]).success,
  ).toBe(true);
});
it("reads legacy snapshots without inventing or rewriting classifications", () => {
  const snapshot = { title: "Old workout", exercises: [exercise] };
  expect(workoutLogSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  expect(workoutExerciseSchema.parse(exercise).role).toBeUndefined();
});
it("projects the role from the placement and defaults pre-column rows to Workout", () => {
  const row = {
    id: exercise.id,
    exerciseId: exercise.id,
    exercise,
    sets: 3,
    target: "8–12",
  };
  expect(workoutExercisesFromRows([row])[0]?.role).toBe("workout");
  expect(
    workoutExercisesFromRows([{ ...row, role: "stretching" }])[0]?.role,
  ).toBe("stretching");
});
