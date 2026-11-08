import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { queries } from "./queries";

const householdId = crypto.randomUUID();
const userId = crypto.randomUUID();
const ctx = { userId };
const ast = (value: unknown) => (value as { ast: AST }).ast;

it("counts only the author's newest nonempty session for each workout", () => {
  const value = ast(
    queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
  );
  const latest = value.related?.find(
    (row) => row.subquery.table === "trainingSessions",
  )?.subquery;

  expect(latest?.limit).toBe(1);
  expect(JSON.stringify(latest?.where)).toContain(userId);
  expect(JSON.stringify(latest?.where)).toContain("trainingSessionExercises");
  expect(JSON.stringify(latest?.where)).toContain("trainingSessionSets");
});

it("bounds catalog performance to one nonempty canonical occurrence for this author", () => {
  const value = ast(
    queries.workouts.catalog.fn({ args: { householdId }, ctx }),
  );
  const occurrence = value.related?.find(
    (row) => row.subquery.table === "trainingSessionExercises",
  )?.subquery;

  expect(occurrence?.limit).toBe(1);
  expect(JSON.stringify(occurrence?.where)).toContain(userId);
  expect(JSON.stringify(occurrence?.where)).toContain(householdId);
  expect(JSON.stringify(occurrence?.where)).toContain("trainingSessionSets");
  expect(occurrence?.related?.[0]?.subquery.orderBy).toEqual([
    ["round", "asc"],
  ]);
});

it("excludes the current occurrence's date while checking author scope for previous hints", () => {
  const beforeAt = 1234.567;
  const value = ast(
    queries.workouts.previousExercises.fn({
      args: { householdId, exerciseIds: [crypto.randomUUID()], beforeAt },
      ctx,
    }),
  );
  const occurrence = value.related?.find(
    (row) => row.subquery.table === "trainingSessionExercises",
  )?.subquery;

  expect(occurrence?.limit).toBe(1);
  expect(JSON.stringify(occurrence?.where)).toContain(String(beforeAt));
  expect(JSON.stringify(occurrence?.where)).toContain(userId);
});
