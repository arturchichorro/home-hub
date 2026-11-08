import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { trainingHistoryPageSize } from "../training";
import { queries } from "./queries";

const householdId = crypto.randomUUID();
const userId = crypto.randomUUID();
const ctx = { userId };
const ast = (value: unknown) => (value as { ast: AST }).ast;

it("uses one canonical, bounded private history for both sources", () => {
  const query = ast(
    queries.training.history.fn({ args: { householdId }, ctx }),
  );

  expect(query.table).toBe("trainingSessions");
  expect(query.limit).toBe(trainingHistoryPageSize + 1);
  expect(JSON.stringify(query.where)).toContain(userId);
  expect(JSON.stringify(query.where)).toContain(householdId);
  expect(JSON.stringify(query.where)).toContain("householdMembers");
  expect(JSON.stringify(query.where)).toContain("householdModuleSettings");
  expect(query.orderBy).toEqual([
    ["completedOn", "desc"],
    ["completedAt", "desc"],
    ["id", "desc"],
  ]);
  expect(query.related?.[0]?.subquery.table).toBe("trainingSessionExercises");
  expect(JSON.stringify(query.related?.[0]?.subquery.where)).toContain(
    '"value":[]',
  );
  expect(query.related?.[0]?.subquery.related?.[0]?.subquery.table).toBe(
    "trainingSessionSets",
  );
});

it("filters per-workout history without changing the storage/query model", () => {
  const workoutId = crypto.randomUUID();
  const value = ast(
    queries.training.history.fn({ args: { householdId, workoutId }, ctx }),
  );

  expect(JSON.stringify(value.where)).toContain(workoutId);
});

it("uses an exclusive stable cursor and bounds author-owned selected/day sessions", () => {
  const cursor = {
    completedOn: "2026-11-08",
    completedAt: 100,
    id: crypto.randomUUID(),
  };
  expect(
    ast(queries.training.history.fn({ args: { householdId, cursor }, ctx }))
      .start?.exclusive,
  ).toBe(true);

  for (const args of [
    { householdId, logId: cursor.id },
    { householdId, completedOn: cursor.completedOn },
  ]) {
    const query = ast(queries.training.session.fn({ args, ctx }));
    expect(query.limit).toBe(1);
    expect(JSON.stringify(query.where)).toContain("deletedAt");
    expect(JSON.stringify(query.where)).toContain(userId);
  }
});
