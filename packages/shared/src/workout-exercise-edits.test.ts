import { describe, expect, it } from "vitest";
import { starterWorkouts } from "./workout-seed";
import {
  editWorkoutExercisesSchema,
  planExerciseEdits,
  updateWorkoutSchema,
  workoutExercisesFromRows,
} from "./workouts";

const before = starterWorkouts[0]?.exercises ?? [];
const first = before[0];
if (!first) throw new Error("seed");
const scope = {
  householdId: crypto.randomUUID(),
  workoutId: crypto.randomUUID(),
  optimisticTimestamp: 1,
};
describe("normalized workout exercise edits", () => {
  it("sends only locally changed fields, never untouched exercise values", () => {
    const after = before.map((e) =>
      e.id === first.id ? { ...e, name: "New name" } : e,
    );
    expect(planExerciseEdits(before, after)).toEqual({
      creates: [],
      updates: [{ exerciseId: first.id, changes: { name: "New name" } }],
      deletes: [],
    });
  });
  it("plans additions and explicit deletions without replacing the collection", () => {
    const added = { ...first, id: crypto.randomUUID(), name: "New exercise" };
    expect(planExerciseEdits(before, [...before.slice(1), added])).toEqual({
      creates: [added],
      updates: [],
      deletes: [first.id],
    });
    expect(planExerciseEdits(before, before)).toEqual({
      creates: [],
      updates: [],
      deletes: [],
    });
  });
  it("keeps database metadata out of snapshots and editor drafts", () => {
    const row = {
      ...first,
      householdId: scope.householdId,
      workoutId: scope.workoutId,
      sortKey: 1024,
      createdAt: 1,
      updatedAt: 2,
    };
    expect(workoutExercisesFromRows([row])).toEqual([first]);
  });
  it("rejects whole-array workout updates and ambiguous/invalid exercise operations", () => {
    expect(
      updateWorkoutSchema.safeParse({
        ...scope,
        changes: { exercises: before },
      }).success,
    ).toBe(false);
    const args = {
      ...scope,
      creates: [],
      updates: [{ exerciseId: first.id, changes: { sets: 3 } }],
      deletes: [],
    };
    expect(editWorkoutExercisesSchema.safeParse(args).success).toBe(true);
    for (const patch of [
      { updates: [{ exerciseId: first.id, changes: {} }] },
      {
        updates: [
          {
            exerciseId: first.id,
            changes: { householdId: crypto.randomUUID() },
          },
        ],
      },
      { updates: [{ exerciseId: first.id, changes: { sets: 11 } }] },
      { updates: [{ exerciseId: first.id, changes: { load: "unknown" } }] },
      { deletes: [first.id] },
      { creates: [{ ...first }] },
      { updates: [], creates: [], deletes: [] },
    ])
      expect(
        editWorkoutExercisesSchema.safeParse({ ...args, ...patch }).success,
      ).toBe(false);
  });
});
