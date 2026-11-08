import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { trainingHistoryPageSize } from "../training";
import { queries } from "./queries";

const householdId = crypto.randomUUID();
const userId = crypto.randomUUID();
const ctx = { userId };
const ast = (query: unknown) => (query as { ast: AST }).ast;
it("scopes both history sources to the author, household, membership and workouts module, without eagerly loading performances", () => {
  for (const query of [
    queries.training.history.fn({ args: { householdId }, ctx }),
    queries.training.workouts.fn({ args: { householdId }, ctx }),
  ]) {
    const value = ast(query);
    expect(value.limit).toBe(trainingHistoryPageSize + 1);
    expect(value.related ?? []).toHaveLength(0);
    expect(JSON.stringify(value.where)).toContain(userId);
    expect(JSON.stringify(value.where)).toContain(householdId);
    expect(JSON.stringify(value.where)).toContain("householdMembers");
    expect(JSON.stringify(value.where)).toContain("householdModuleSettings");
    expect(value.orderBy).toEqual([
      ["completedOn", "desc"],
      ["completedAt", "desc"],
      ["id", "desc"],
    ]);
  }
});
it("bounds a resumed session and scopes every occurrence to its original author and household", () => {
  const value = ast(
    queries.training.session.fn({
      args: { householdId, logId: crypto.randomUUID() },
      ctx,
    }),
  );
  expect(value.limit).toBe(1);
  expect(JSON.stringify(value.where)).toContain("deletedAt");
  const links = value.related?.[0]?.subquery;
  expect(links?.table).toBe("trainingSessionExercises");
  expect(JSON.stringify(links?.where)).toContain(userId);
  expect(JSON.stringify(links?.where)).toContain(householdId);
  expect(links?.orderBy).toEqual([
    ["position", "asc"],
    ["exerciseId", "asc"],
  ]);
  expect(JSON.stringify(links?.related?.[0]?.subquery.where)).toContain(userId);
});
it("uses a deterministic cross-source tie break when both tables happen to have the same UUID and timestamp", () => {
  const cursor = {
    completedOn: "2026-11-08",
    completedAt: 100,
    id: crypto.randomUUID(),
    kind: "workout" as const,
  };
  const afterWorkout = ast(
    queries.training.history.fn({ args: { householdId, cursor }, ctx }),
  );
  const afterFree = ast(
    queries.training.history.fn({
      args: { householdId, cursor: { ...cursor, kind: "free" } },
      ctx,
    }),
  );
  expect(afterWorkout.start?.exclusive).toBe(false);
  expect(afterFree.start?.exclusive).toBe(true);
  expect(
    ast(queries.training.workouts.fn({ args: { householdId, cursor }, ctx }))
      .start?.exclusive,
  ).toBe(true);
});
