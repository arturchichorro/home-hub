import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import { queries } from "./queries";

const householdId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  workoutId = crypto.randomUUID();
const ast = (query: unknown) => (query as { ast: AST }).ast;
const equals = (name: string, value: string) => ({
  type: "simple",
  left: { type: "column", name },
  op: "=",
  right: { type: "literal", value },
});
it("does not count an empty or note-only grouping as the latest workout activity", () => {
  const query = ast(
    queries.workouts.byHousehold.fn({ args: { householdId }, ctx: { userId } }),
  );
  const latest = query.related?.find(
    (r) => r.subquery.table === "workoutLogs",
  )?.subquery;
  expect(latest?.limit).toBe(1);
  for (const table of [
    "workoutLogExercises",
    "exerciseLogs",
    "exerciseLogSets",
  ])
    expect(JSON.stringify(latest?.where)).toContain(table);
});
it("bounds the catalog to one nonempty occurrence for the authenticated author", () => {
  const query = ast(
    queries.workouts.catalog.fn({ args: { householdId }, ctx: { userId } }),
  );
  const occurrence = query.related?.find(
    (r) => r.subquery.table === "exerciseLogs",
  )?.subquery;
  expect(occurrence).toMatchObject({
    limit: 1,
    where: {
      type: "and",
      conditions: expect.arrayContaining([
        equals("householdId", householdId),
        equals("userId", userId),
      ]),
    },
  });
  expect(JSON.stringify(occurrence?.where)).toContain("exerciseLogSets");
  expect(occurrence?.related?.[0]?.subquery).toMatchObject({
    table: "exerciseLogSets",
    orderBy: [["round", "asc"]],
  });
  expect(JSON.stringify(query.where)).toContain("householdMembers");
  expect(JSON.stringify(query.where)).toContain("householdModuleSettings");
});
it("excludes the selected occurrence's time and checks ownership even for deleted historical identities", () => {
  const beforeAt = 1234.567,
    query = ast(
      queries.workouts.previousExercises.fn({
        args: { householdId, exerciseIds: [crypto.randomUUID()], beforeAt },
        ctx: { userId },
      }),
    );
  const occurrence = query.related?.find(
    (r) => r.subquery.table === "exerciseLogs",
  )?.subquery;
  expect(occurrence).toMatchObject({
    limit: 1,
    where: {
      type: "and",
      conditions: expect.arrayContaining([
        equals("userId", userId),
        {
          type: "simple",
          left: { type: "column", name: "performedAt" },
          op: "<",
          right: { type: "literal", value: beforeAt },
        },
      ]),
    },
  });
  expect(JSON.stringify(query.where)).toContain(userId);
  expect(JSON.stringify(query.where)).toContain("exerciseLogs");
});
it("guards the workout grouping and both linked levels by author and household", () => {
  const query = ast(
    queries.workouts.logsV2.fn({
      args: { householdId, workoutId },
      ctx: { userId },
    }),
  );
  const links = query.related?.find(
    (r) => r.subquery.table === "workoutLogExercises",
  )?.subquery;
  const occurrence = links?.related?.find(
    (r) => r.subquery.table === "exerciseLogs",
  )?.subquery;
  for (const node of [query, links, occurrence])
    expect(node).toMatchObject({
      where: {
        type: "and",
        conditions: expect.arrayContaining([
          equals("householdId", householdId),
          equals("userId", userId),
        ]),
      },
    });
  expect(JSON.stringify(query.where)).toContain("householdMembers");
  expect(JSON.stringify(query.where)).toContain("householdModuleSettings");
});
