import { logOnlyWorkoutExercise } from "@home-hub/shared/exercise-logs";
import { workoutLogSnapshotSchema } from "@home-hub/shared/workouts";
import { expect, it } from "vitest";
import { projectWorkoutLog } from "./workout-log-projection";

const slot = crypto.randomUUID();

const definition = {
  id: slot,
  catalogExerciseId: crypto.randomUUID(),
  name: "Squat",
  unit: "reps",
  load: "bodyweight",
  unilateral: false,
  sets: 2,
  target: "10",
};

const log = {
  id: crypto.randomUUID(),
  householdId: crypto.randomUUID(),
  workoutId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  completedOn: "2026-11-01",
  completedAt: 1,
  createdAt: 1,
  note: "",
  snapshot: { title: "Earlier", exercises: [definition] },
  loggedExercises: [],
};

it("projects frozen roles without mutating strict legacy definition JSON", () => {
  const projected = projectWorkoutLog({
    ...log,
    exerciseRoles: { [slot]: "warmup" },
  });
  expect(
    (projected.snapshot as { exercises: { role: string }[] }).exercises[0]
      ?.role,
  ).toBe("warmup");
  expect(log.snapshot.exercises[0]).not.toHaveProperty("role");
});

it("appends log-only definitions from owned occurrences without rewriting the base snapshot", () => {
  const extra = logOnlyWorkoutExercise({
    id: crypto.randomUUID(),
    name: "Extra press",
    unit: "reps",
    load: "single",
    unilateral: false,
  });
  const occurrenceId = crypto.randomUUID();
  const before = structuredClone(log.snapshot);
  const projected = projectWorkoutLog({
    ...log,
    loggedExercises: [
      {
        workoutLogId: log.id,
        workoutExerciseId: extra.id,
        exerciseLogId: occurrenceId,
        householdId: log.householdId,
        userId: log.userId,
        position: 1,
        occurrence: {
          id: occurrenceId,
          householdId: log.householdId,
          userId: log.userId,
          exerciseId: extra.catalogExerciseId ?? extra.id,
          performedOn: log.completedOn,
          performedAt: log.completedAt,
          snapshot: extra,
          sets: [
            {
              exerciseLogId: occurrenceId,
              round: 1,
              amount: 10,
              weightKg: 8,
              rightAmount: null,
              unit: "reps",
              load: "single",
              unilateral: false,
            },
          ],
        },
      },
    ],
  });
  expect(workoutLogSnapshotSchema.parse(projected.snapshot).exercises).toEqual([
    { ...definition, role: "workout" },
    extra,
  ]);
  expect(projected.logOnlyExerciseIds).toEqual([extra.id]);
  expect(projected.exerciseLogIds?.[extra.id]).toBe(occurrenceId);
  expect(projected.sets[0]).toMatchObject({
    workoutExerciseId: extra.id,
    exerciseId: extra.catalogExerciseId,
  });
  expect(log.snapshot).toEqual(before);
});

it("uses Workout for history from before role snapshots", () => {
  expect(
    (projectWorkoutLog(log).snapshot as { exercises: { role: string }[] })
      .exercises[0]?.role,
  ).toBe("workout");
});
