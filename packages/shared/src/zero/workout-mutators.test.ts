import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starterWorkouts } from "../workout-seed";
import { workoutContentSchema } from "../workouts";
import { mutators } from "./mutators";
import { queries } from "./queries";
import type { Schema } from "./schema.gen";

const householdId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  other = crypto.randomUUID(),
  workoutId = crypto.randomUUID(),
  logId = crypto.randomUUID();
const now = Date.parse("2026-10-25T23:30:00Z");
const ctx = { userId },
  scope = { householdId, workoutId, optimisticTimestamp: 1234 };
const starter = workoutContentSchema.parse(starterWorkouts[0]);
type Row = Record<string, unknown>;
type Condition =
  | { type: "and"; conditions: Condition[] }
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: unknown };
    }
  | {
      type: "correlatedSubquery";
      related: {
        correlation: { parentField: string[]; childField: string[] };
        subquery: { table: string; where?: Condition };
      };
    };
function matches(
  row: Row,
  condition: Condition | undefined,
  data: Record<string, Row[]>,
): boolean {
  if (!condition) return true;
  if (condition.type === "and")
    return condition.conditions.every((c) => matches(row, c, data));
  if (condition.type === "correlatedSubquery") {
    const { correlation, subquery } = condition.related;
    return (data[subquery.table] ?? []).some(
      (r) =>
        correlation.parentField.every(
          (field, i) => row[field] === r[correlation.childField[i] ?? ""],
        ) && matches(r, subquery.where, data),
    );
  }
  if (condition.op === "IS" && condition.right.value === null)
    return row[condition.left.name] == null;
  if (condition.op === "=")
    return row[condition.left.name] === condition.right.value;
  throw new Error(`Unsupported operator ${condition.op}`);
}

function setup(location: "server" | "client" = "server") {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const data: Record<string, Row[]> = {
    households: [{ id: householdId, deletedAt: null }],
    householdMembers: [{ householdId, userId }],
    householdModuleSettings: [
      { householdId, moduleKey: "workouts", enabled: true },
    ],
    workouts: [{ id: workoutId, householdId, ...structuredClone(starter) }],
    workoutLogs: [],
    workoutLogSets: [],
  };
  const writes = vi.fn();
  const sameKey = (table: string, a: Row, b: Row) =>
    table === "workoutLogSets"
      ? a.logId === b.logId &&
        a.exerciseId === b.exerciseId &&
        a.round === b.round
      : a.id === b.id;
  const crud = (table: string) => ({
    insert: async (row: Row) => {
      if (data[table]?.some((r) => sameKey(table, r, row)))
        throw new Error("duplicate");
      writes(table, "insert", row);
      data[table]?.push(structuredClone(row));
    },
    update: async (row: Row) => {
      writes(table, "update", row);
      const found = data[table]?.find((r) => sameKey(table, r, row));
      if (found) Object.assign(found, structuredClone(row));
    },
    upsert: async (row: Row) => {
      writes(table, "upsert", row);
      const found = data[table]?.find((r) => sameKey(table, r, row));
      if (found) Object.assign(found, structuredClone(row));
      else data[table]?.push(structuredClone(row));
    },
  });
  const tx = {
    location,
    mutate: Object.fromEntries(
      ["workouts", "workoutLogs", "workoutLogSets"].map((t) => [t, crud(t)]),
    ),
    run: async (query: unknown) => {
      const { ast, format } = query as {
        ast: { table: string; where?: Condition; orderBy?: [string, string][] };
        format: { singular: boolean };
      };
      const rows = (data[ast.table] ?? [])
        .filter((r) => matches(r, ast.where, data))
        .map((r) =>
          ast.table === "workoutLogs"
            ? {
                ...r,
                sets: (data.workoutLogSets ?? []).filter(
                  (s) => s.logId === r.id,
                ),
              }
            : r,
        );
      for (const [field, direction] of [...(ast.orderBy ?? [])].reverse())
        rows.sort((a, b) => {
          const av = a[field] as string | number,
            bv = b[field] as string | number;
          return (
            (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1)
          );
        });
      return format.singular ? rows[0] : rows;
    },
  } as unknown as Transaction<Schema>;
  const log = (action: "start" | "complete") =>
    mutators.workouts.log.fn({
      tx,
      ctx,
      args: { ...scope, logId, action, timeZone: "Europe/Brussels" },
    });
  const set = () =>
    mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...scope,
        logId,
        exerciseId: starter.exercises[0]?.id ?? "",
        round: 1,
        values: { weightKg: 8, amount: 10, rightAmount: null },
      },
    });
  return { tx, data, writes, log, set };
}
afterEach(() => vi.restoreAllMocks());
describe("workout logging", () => {
  it("marks a workout done directly without starting or filling in sets", async () => {
    const { data, log } = setup();
    await log("complete");
    expect(data.workoutLogs?.[0]).toMatchObject({
      userId,
      workoutId,
      status: "completed",
      completedOn: "2026-10-26",
      completedAt: now,
    });
    expect(data.workoutLogSets).toHaveLength(0);
    await log("complete");
    expect(data.workoutLogs).toHaveLength(1);
  });
  it("completes a partial log and keeps independently saved sets", async () => {
    const { data, log, set } = setup();
    await log("start");
    await set();
    await log("complete");
    expect(data.workoutLogs?.[0]?.status).toBe("completed");
    expect(data.workoutLogSets).toHaveLength(1);
    await set();
    expect(data.workoutLogSets).toHaveLength(1);
  });
  it("keeps historical content when a shared workout is edited", async () => {
    const { data, tx, log } = setup();
    await log("start");
    await mutators.workouts.update.fn({
      tx,
      ctx,
      args: { ...scope, changes: { title: "Changed", notes: "One note" } },
    });
    expect(data.workouts?.[0]).toMatchObject({
      title: "Changed",
      notes: "One note",
    });
    expect(
      workoutContentSchema.parse(data.workoutLogs?.[0]?.snapshot).title,
    ).toBe(starter.title);
  });
  it.each([
    "foreign user",
    "foreign household",
    "foreign workout",
    "abandoned",
  ])("rejects set edits to %s logs", async (reason) => {
    const { data, log, set, writes } = setup();
    await log("start");
    const row = data.workoutLogs?.[0];
    if (!row) throw new Error("log");
    if (reason === "foreign user") row.userId = other;
    if (reason === "foreign household") row.householdId = other;
    if (reason === "foreign workout") row.workoutId = other;
    if (reason === "abandoned") row.status = "abandoned";
    writes.mockClear();
    await expect(set()).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["disabled", "missing module", "not member", "deleted household"])(
    "blocks every mutation when %s",
    async (reason) => {
      const { tx, data, log, set, writes } = setup();
      if (reason === "disabled" && data.householdModuleSettings?.[0])
        data.householdModuleSettings[0].enabled = false;
      if (reason === "missing module") data.householdModuleSettings = [];
      if (reason === "not member") data.householdMembers = [];
      if (reason === "deleted household" && data.households?.[0])
        data.households[0].deletedAt = now;
      const requests = [
        () => log("complete"),
        set,
        () =>
          mutators.workouts.create.fn({
            tx,
            ctx,
            args: { ...scope, title: "New" },
          }),
        () =>
          mutators.workouts.update.fn({
            tx,
            ctx,
            args: { ...scope, changes: { notes: "One note" } },
          }),
        () =>
          mutators.workouts.importStarters.fn({
            tx,
            ctx,
            args: {
              householdId,
              workoutIds: [
                crypto.randomUUID(),
                crypto.randomUUID(),
                crypto.randomUUID(),
              ],
              optimisticTimestamp: 1,
            },
          }),
      ];
      for (const request of requests)
        await expect(request()).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown or foreign workouts for logging", async () => {
    const { data, log } = setup();
    if (data.workouts?.[0]) data.workouts[0].householdId = other;
    await expect(log("complete")).rejects.toThrow("not allowed");
  });
  it("cannot complete another person's log by its ID", async () => {
    const { data, log } = setup();
    await log("start");
    if (data.workoutLogs?.[0]) data.workoutLogs[0].userId = other;
    await expect(log("complete")).rejects.toThrow();
    expect(data.workoutLogs?.[0]?.status).toBe("active");
  });
  it("uses optimistic time only on the client", async () => {
    const { data, log } = setup("client");
    await log("complete");
    expect(data.workoutLogs?.[0]?.completedAt).toBe(1234);
  });
});
describe("workout query privacy", () => {
  it("shares workouts while restricting logs and sets to their owner", async () => {
    const { data, tx, log, set } = setup();
    await log("start");
    await set();
    data.workoutLogs?.push({
      ...data.workoutLogs[0],
      id: other,
      userId: other,
    });
    data.workoutLogSets?.push({ logId: other, values: { note: "SECRET" } });
    const args = { householdId, workoutId };
    expect(
      await tx.run(
        queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
      ),
    ).toHaveLength(1);
    const logs = await tx.run(queries.workouts.logs.fn({ args, ctx }));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("SECRET");
  });
  it.each(["module", "membership", "household"])(
    "blocks queries after losing %s access",
    async (reason) => {
      const { data, tx, log } = setup();
      await log("start");
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      expect(
        await tx.run(
          queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
        ),
      ).toHaveLength(0);
      expect(
        await tx.run(
          queries.workouts.detail.fn({ args: { householdId, workoutId }, ctx }),
        ),
      ).toBeUndefined();
      expect(
        await tx.run(
          queries.workouts.logs.fn({ args: { householdId, workoutId }, ctx }),
        ),
      ).toHaveLength(0);
    },
  );
});
