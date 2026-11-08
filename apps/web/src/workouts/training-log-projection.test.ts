import { workoutLogSnapshotSchema } from "@home-hub/shared/workouts";
import { expect, it } from "vitest";
import {
  projectTrainingSession,
  type TrainingSessionRow,
} from "./training-log-projection";

const session: TrainingSessionRow = {
  id: crypto.randomUUID(),
  householdId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  workoutId: crypto.randomUUID(),
  name: "Frozen title",
  note: "Private",
  completedOn: "2026-11-01",
  completedAt: 1,
  createdAt: 1,
  deletedAt: null,
  exercises: [],
};

it("projects normalized prescriptions, extras, roles and original IDs without storing a second snapshot", () => {
  const slot = crypto.randomUUID();
  const catalog = crypto.randomUUID();
  const row = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    householdId: session.householdId,
    userId: session.userId,
    templateExerciseId: slot,
    exerciseId: catalog,
    position: 0,
    name: "Frozen squat",
    role: "warmup" as const,
    unit: "reps",
    load: "bodyweight",
    unilateral: false,
    plannedSets: 3,
    target: "10",
    performedOn: session.completedOn,
    performedAt: 1,
    deletedAt: null,
    sets: [],
  };
  const extra = {
    ...row,
    id: crypto.randomUUID(),
    templateExerciseId: null,
    exerciseId: crypto.randomUUID(),
    position: 1,
    role: "workout" as const,
    plannedSets: null,
    target: null,
  };
  const source = { ...session, exercises: [extra, row] };
  const before = structuredClone(source);
  const view = projectTrainingSession(source);
  const definition = workoutLogSnapshotSchema.parse(view.snapshot);

  expect(definition.title).toBe("Frozen title");
  expect(definition.exercises.map((value) => value.id)).toEqual([
    slot,
    extra.exerciseId,
  ]);
  expect(definition.exercises[0]).toMatchObject({
    role: "warmup",
    name: row.name,
    sets: 3,
    target: "10",
  });
  expect(view.sessionExerciseIds?.[slot]).toBe(row.id);
  expect(view.logOnlyExerciseIds).toEqual([extra.exerciseId]);
  expect(source).toEqual(before);
});

it("projects an unnamed free session with a display default, without changing stored text", () => {
  const source = { ...session, workoutId: null, name: "" };
  expect(
    workoutLogSnapshotSchema.parse(projectTrainingSession(source).snapshot)
      .title,
  ).toBe("Free training");
  expect(source.name).toBe("");
});

it("does not project deleted occurrences", () => {
  expect(projectTrainingSession(session).sets).toEqual([]);
});
