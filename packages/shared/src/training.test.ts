import { expect, it } from "vitest";
import {
  saveTrainingSetSchema,
  trainingLogSearchSchema,
  updateTrainingSessionSchema,
} from "./training";

function payload() {
  const id = crypto.randomUUID();

  return {
    householdId: crypto.randomUUID(),
    logId: crypto.randomUUID(),
    workoutId: null,
    completedOn: "2026-11-08",
    timeZone: "UTC",
    optimisticTimestamp: 100,
    name: "",
    note: "",
    sessionExerciseId: id,
    round: 10,
    values: { amount: 0, rightAmount: null, weightKg: null },
    exercises: [
      {
        id,
        catalogExerciseId: crypto.randomUUID(),
        templateExerciseId: null,
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
        isNew: true,
      },
    ],
  };
}

it("accepts a canonical free set and rejects duplicate identities or an eleventh round", () => {
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

it("allows only name/note patches, never reassignment of dates, sources or authorship", () => {
  const { householdId, logId } = payload();
  expect(
    updateTrainingSessionSchema.parse({
      householdId,
      logId,
      changes: { name: "  Private " },
    }).changes.name,
  ).toBe("Private");

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

it("rejects invalid measurements, actor spoofing and legacy snapshot payloads", () => {
  const args = payload();

  for (const values of [
    { ...args.values, amount: -1 },
    { ...args.values, amount: 1.5 },
    { ...args.values, weightKg: -1 },
  ]) {
    expect(saveTrainingSetSchema.safeParse({ ...args, values }).success).toBe(
      false,
    );
  }

  expect(
    saveTrainingSetSchema.safeParse({ ...args, userId: crypto.randomUUID() })
      .success,
  ).toBe(false);
  expect(
    saveTrainingSetSchema.safeParse({
      ...args,
      snapshot: { notes: "Never copy shared notes" },
    }).success,
  ).toBe(false);
  expect(
    updateTrainingSessionSchema.parse({
      householdId: args.householdId,
      logId: args.logId,
      changes: { note: "  Private\nNote  " },
    }).changes.note,
  ).toBe("Private\nNote");
  expect(
    updateTrainingSessionSchema.safeParse({
      householdId: args.householdId,
      logId: args.logId,
      changes: { note: "x".repeat(1000001) },
    }).success,
  ).toBe(false);
});

it("validates history selection without retaining unrelated URL search fields", () => {
  const log = crypto.randomUUID();
  expect(trainingLogSearchSchema.parse({ log, unrelated: 1 })).toEqual({ log });
  expect(trainingLogSearchSchema.safeParse({ log: "invalid" }).success).toBe(
    false,
  );
});
