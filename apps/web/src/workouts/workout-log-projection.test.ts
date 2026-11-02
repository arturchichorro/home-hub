import { expect, it } from "vitest";
import { projectWorkoutLog } from "./workout-log-projection";

const slot = crypto.randomUUID(),
  definition = {
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
it("uses Workout for history from before role snapshots", () => {
  expect(
    (projectWorkoutLog(log).snapshot as { exercises: { role: string }[] })
      .exercises[0]?.role,
  ).toBe("workout");
});
