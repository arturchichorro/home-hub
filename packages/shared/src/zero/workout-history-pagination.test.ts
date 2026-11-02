import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { queries, workoutHistoryPageSize } from "./queries";

const householdId = crypto.randomUUID(),
  workoutId = crypto.randomUUID(),
  userId = crypto.randomUUID();
const ast = (q: unknown) => (q as { ast: AST }).ast;
it("uses an exclusive stable composite cursor with a bounded lookahead", () => {
  const cursor = {
    completedOn: "2026-10-02",
    completedAt: 12345,
    id: crypto.randomUUID(),
  };
  const q = ast(
    queries.workouts.historyPage.fn({
      args: { householdId, workoutId, cursor },
      ctx: { userId },
    }),
  );
  expect(q.limit).toBe(workoutHistoryPageSize + 1);
  expect(q.start).toMatchObject({ row: cursor, exclusive: true });
  expect(q.orderBy).toEqual([
    ["completedOn", "desc"],
    ["completedAt", "desc"],
    ["id", "desc"],
  ]);
  const serialized = JSON.stringify(q);
  for (const scope of [
    userId,
    householdId,
    workoutId,
    "householdMembers",
    "householdModuleSettings",
  ])
    expect(serialized).toContain(scope);
  expect(serialized).toContain("loggedExercises");
});
it("pins a selected historical log or current local day independently of the page", () => {
  const logId = crypto.randomUUID();
  for (const q of [
    ast(
      queries.workouts.logById.fn({
        args: { householdId, workoutId, logId },
        ctx: { userId },
      }),
    ),
    ast(
      queries.workouts.logForDay.fn({
        args: { householdId, workoutId, completedOn: "2026-10-02" },
        ctx: { userId },
      }),
    ),
  ]) {
    expect(q.limit).toBe(1);
    for (const value of [
      householdId,
      workoutId,
      userId,
      "workoutLogExercises",
      "exerciseLogSets",
    ])
      expect(JSON.stringify(q)).toContain(value);
  }
});
