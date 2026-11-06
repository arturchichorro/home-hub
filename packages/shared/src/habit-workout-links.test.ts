import { expect, it } from "vitest";
import {
  habitCompleted,
  linkHabitWorkoutsMutationSchema,
  setHabitCompletedMutationSchema,
} from "./habits";

const args = {
  householdId: crypto.randomUUID(),
  habitId: crypto.randomUUID(),
  optimisticTimestamp: 1,
};

it("validates selected-list semantics and rejects invalid link modes", () => {
  expect(
    linkHabitWorkoutsMutationSchema.safeParse({
      ...args,
      mode: "any",
      workoutIds: [],
    }).success,
  ).toBe(true);

  for (const payload of [
    { ...args, mode: "selected", workoutIds: [] },
    { ...args, mode: "none", workoutIds: [crypto.randomUUID()] },
    { ...args, mode: "invalid", workoutIds: [] },
  ]) {
    expect(linkHabitWorkoutsMutationSchema.safeParse(payload).success).toBe(
      false,
    );
  }
});

it("manual OR automatic completion works without conflating their sources", () => {
  expect(habitCompleted({ completed: false, workoutCompleted: true })).toBe(
    true,
  );
  expect(habitCompleted({ completed: true, workoutCompleted: false })).toBe(
    true,
  );
  expect(habitCompleted({ completed: false, workoutCompleted: false })).toBe(
    false,
  );
  expect(habitCompleted(undefined)).toBe(false);
});

it("manual requests cannot spoof a derived flag", () => {
  expect(
    setHabitCompletedMutationSchema.safeParse({
      ...args,
      entryOn: "2026-11-03",
      completed: true,
      timeZone: "UTC",
      workoutCompleted: true,
    }).success,
  ).toBe(false);
});
