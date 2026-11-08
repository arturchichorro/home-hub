import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { trainingHistoryPageSize as workoutHistoryPageSize } from "../training";
import { queries } from "./queries";

const householdId = crypto.randomUUID();

const workoutId = crypto.randomUUID();

const userId = crypto.randomUUID();

const ast = (q: unknown) => (q as { ast: AST }).ast;

it("uses an exclusive stable composite cursor with a bounded lookahead", () => {
  const cursor = {
    completedOn: "2026-10-02",
    completedAt: 12345,
    id: crypto.randomUUID(),
  };
  const q = ast(
    queries.training.history.fn({
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
  ]) {
    expect(serialized).toContain(scope);
  }

  expect(serialized).toContain("exercises");
});

it("pins a selected historical log or current local day independently of the page", () => {
  const logId = crypto.randomUUID();

  for (const q of [
    ast(
      queries.training.session.fn({
        args: { householdId, workoutId, logId },
        ctx: { userId },
      }),
    ),
    ast(
      queries.training.session.fn({
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
      "trainingSessionExercises",
      "trainingSessionSets",
    ]) {
      expect(JSON.stringify(q)).toContain(value);
    }
  }
});
