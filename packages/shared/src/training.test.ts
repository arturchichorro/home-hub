import { expect, it } from "vitest";
import { logOnlyWorkoutExercise } from "./exercise-logs";
import {
  saveTrainingSetSchema,
  trainingLogSearchSchema,
  updateTrainingSessionSchema,
} from "./training";

function payload() {
  const exercise = logOnlyWorkoutExercise({
    id: crypto.randomUUID(),
    name: "Squat",
    unit: "reps",
    load: "bodyweight",
    unilateral: false,
  });

  return {
    householdId: crypto.randomUUID(),
    logId: crypto.randomUUID(),
    completedOn: "2026-11-08",
    timeZone: "UTC",
    optimisticTimestamp: 100,
    name: "",
    note: "",
    exerciseId: exercise.id,
    exercises: [{ exercise, exerciseLogId: crypto.randomUUID(), isNew: true }],
    round: 10,
    values: { amount: 0, rightAmount: null, weightKg: null },
  };
}

it("allows a workout-less request and zero at the tenth set, but rejects an eleventh set or duplicate exercises", () => {
  const args = payload();

  expect(saveTrainingSetSchema.safeParse(args).success).toBe(true);
  expect(saveTrainingSetSchema.safeParse({ ...args, round: 11 }).success).toBe(
    false,
  );
  expect(
    saveTrainingSetSchema.safeParse({
      ...args,
      exercises: [...args.exercises, ...args.exercises],
    }).success,
  ).toBe(false);
});

it("rejects a duplicate occurrence UUID even across two different catalog identities", () => {
  const first = payload();
  const second = payload();

  expect(
    saveTrainingSetSchema.safeParse({
      ...first,
      exercises: [
        ...first.exercises,
        ...second.exercises.map((item) => ({
          ...item,
          exerciseLogId: first.exercises[0]?.exerciseLogId,
        })),
      ],
    }).success,
  ).toBe(false);
});

it("accepts only private name/note patches and cannot reassign authorship, dates or templates", () => {
  const { householdId, logId } = payload();

  expect(
    updateTrainingSessionSchema.parse({
      householdId,
      logId,
      changes: { name: "  Private  " },
    }).changes,
  ).toEqual({ name: "Private" });
  for (const changes of [
    {},
    { userId: crypto.randomUUID() },
    { completedOn: "2025-01-01" },
    { workoutId: crypto.randomUUID() },
  ]) {
    expect(
      updateTrainingSessionSchema.safeParse({ householdId, logId, changes })
        .success,
    ).toBe(false);
  }
});

it("validates the selected history identity without making unrelated URL search parameters part of the query", () => {
  const id = crypto.randomUUID();

  expect(
    trainingLogSearchSchema.parse({ log: id, unrelated: "ignored" }),
  ).toEqual({ log: id });
  expect(trainingLogSearchSchema.safeParse({ log: "not-a-log" }).success).toBe(
    false,
  );
});
