import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starterWorkouts } from "../workout-seed";
import {
  type WorkoutSetValues,
  workoutContentSchema,
  workoutLogSnapshotSchema,
} from "../workouts";
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
const snapshot = { title: starter.title, exercises: starter.exercises };
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
    workouts: [
      {
        id: workoutId,
        householdId,
        sortKey: 1024,
        ...structuredClone(starter),
      },
    ],
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
    delete: async (row: Row) => {
      writes(table, "delete", row);
      data[table] = (data[table] ?? []).filter((r) => !sameKey(table, r, row));
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
  const record = (
    changes: Partial<
      Parameters<typeof mutators.workouts.saveLog.fn>[0]["args"]
    > = {},
  ) =>
    mutators.workouts.saveLog.fn({
      tx,
      ctx,
      args: {
        ...scope,
        logId,
        snapshot,
        note: "",
        sets: [],
        timeZone: "Europe/Brussels",
        ...changes,
      },
    });
  return { tx, data, writes, record };
}
afterEach(() => vi.restoreAllMocks());
const recordedSet = {
  exerciseId: starter.exercises[0]?.id ?? "",
  round: 1,
  values: { weightKg: 8, amount: 10, rightAmount: null },
};
describe("completed workout logs", () => {
  it("creates the log, note and sets in a single explicit save", async () => {
    const { data, record } = setup();
    expect(data.workoutLogs).toHaveLength(0);
    await record({ note: "Felt good.\nLight weights.", sets: [recordedSet] });
    expect(data.workoutLogs?.[0]).toMatchObject({
      userId,
      workoutId,
      completedOn: "2026-10-26",
      completedAt: now,
      note: "Felt good.\nLight weights.",
    });
    expect(data.workoutLogs?.[0]).not.toHaveProperty("status");
    expect(data.workoutLogs?.[0]?.snapshot).not.toHaveProperty("notes");
    expect(data.workoutLogSets).toHaveLength(1);
  });
  it("updates today's log even when another client submits a fresh ID", async () => {
    const { data, record } = setup();
    await record({ sets: [recordedSet], note: "First" });
    await record({
      logId: crypto.randomUUID(),
      sets: [{ ...recordedSet, values: { ...recordedSet.values, amount: 12 } }],
      note: "Updated",
    });
    expect(data.workoutLogs).toHaveLength(1);
    expect(data.workoutLogs?.[0]).toMatchObject({ id: logId, note: "Updated" });
    expect(data.workoutLogSets).toHaveLength(1);
    expect(data.workoutLogSets?.[0]).toMatchObject({
      logId,
      values: { amount: 12 },
    });
  });
  it("creates a different log on the next local day and keeps historical edits on their original day", async () => {
    const { data, record } = setup();
    await record({ note: "Yesterday" });
    vi.spyOn(Date, "now").mockReturnValue(now + 86400000);
    const nextId = crypto.randomUUID();
    await record({ logId: nextId, note: "Today" });
    expect(data.workoutLogs).toHaveLength(2);
    await record({ note: "Correct yesterday" });
    expect(data.workoutLogs?.find((row) => row.id === nextId)).toMatchObject({
      note: "Today",
      completedOn: "2026-10-27",
    });
    expect(data.workoutLogs?.find((row) => row.id === logId)).toMatchObject({
      note: "Correct yesterday",
      completedOn: "2026-10-26",
    });
  });
  it("keeps daily logs separate for different authors and workouts", async () => {
    const { data, record, tx } = setup();
    await record();
    data.householdMembers?.push({ householdId, userId: other });
    await mutators.workouts.saveLog.fn({
      tx,
      ctx: { userId: other },
      args: {
        ...scope,
        logId: crypto.randomUUID(),
        snapshot,
        note: "Other user",
        sets: [],
        timeZone: "Europe/Brussels",
      },
    });
    data.workouts?.push({ ...data.workouts[0], id: other });
    await record({ workoutId: other, logId: crypto.randomUUID() });
    expect(data.workoutLogs).toHaveLength(3);
  });
  it("allows a deliberate note-only log without fabricating repetitions", async () => {
    const { data, record } = setup();
    await record({ note: "Mobility only" });
    expect(data.workoutLogs).toHaveLength(1);
    expect(data.workoutLogSets).toHaveLength(0);
  });
  it("is idempotent and atomically replaces edited set values", async () => {
    const { data, record } = setup();
    await record({ sets: [recordedSet] });
    await record({ sets: [recordedSet] });
    expect(data.workoutLogs).toHaveLength(1);
    expect(data.workoutLogSets).toHaveLength(1);
    await record({
      note: "Corrected",
      sets: [{ ...recordedSet, values: { ...recordedSet.values, amount: 11 } }],
    });
    expect(data.workoutLogSets).toHaveLength(1);
    expect(data.workoutLogSets?.[0]?.values).toMatchObject({ amount: 11 });
    await record({ note: "Note only", sets: [] });
    expect(data.workoutLogSets).toHaveLength(0);
  });
  it("preserves original dates and snapshots while editing history", async () => {
    const { data, record, tx } = setup();
    await record({ sets: [recordedSet] });
    await mutators.workouts.update.fn({
      tx,
      ctx,
      args: { ...scope, changes: { title: "Changed", notes: "New notes" } },
    });
    vi.spyOn(Date, "now").mockReturnValue(now + 86400000);
    await record({
      snapshot: { ...snapshot, title: "Another title" },
      note: "Edited",
    });
    expect(data.workoutLogs?.[0]).toMatchObject({
      completedAt: now,
      completedOn: "2026-10-26",
      note: "Edited",
    });
    expect(
      workoutLogSnapshotSchema.parse(data.workoutLogs?.[0]?.snapshot).title,
    ).toBe(starter.title);
    expect(data.workouts?.[0]?.notes).toBe("New notes");
  });
  it.each([
    "unknown exercise",
    "too many sets",
    "wrong side",
    "bodyweight load",
  ])("rejects %s before writing anything", async (reason) => {
    const { data, record, writes } = setup();
    const bodyweight = starter.exercises.find((e) => e.load === "bodyweight");
    if (!bodyweight) throw new Error("seed");
    const invalid: {
      exerciseId: string;
      round: number;
      values: WorkoutSetValues;
    } = { ...recordedSet, round: 2, values: { ...recordedSet.values } };
    if (reason === "unknown exercise") invalid.exerciseId = other;
    if (reason === "too many sets") invalid.round = 3;
    if (reason === "wrong side") invalid.values.rightAmount = 8;
    if (reason === "bodyweight load") invalid.exerciseId = bodyweight.id;
    await expect(record({ sets: [recordedSet, invalid] })).rejects.toThrow(
      "not allowed",
    );
    expect(writes).not.toHaveBeenCalled();
    expect(data.workoutLogs).toHaveLength(0);
  });
  it.each(["foreign user", "foreign household", "foreign workout"])(
    "cannot modify %s history",
    async (reason) => {
      const { data, record, writes } = setup();
      await record({ note: "Original" });
      const row = data.workoutLogs?.[0];
      if (!row) throw new Error("log");
      if (reason === "foreign user") row.userId = other;
      if (reason === "foreign household") row.householdId = other;
      if (reason === "foreign workout") row.workoutId = other;
      writes.mockClear();
      await expect(
        record({ note: "No", sets: [recordedSet] }),
      ).rejects.toThrow();
      expect(writes).not.toHaveBeenCalled();
      expect(row.note).toBe("Original");
    },
  );
  it.each(["disabled", "missing module", "not member", "deleted household"])(
    "blocks mutations when %s",
    async (reason) => {
      const { tx, data, record, writes } = setup();
      if (reason === "disabled" && data.householdModuleSettings?.[0])
        data.householdModuleSettings[0].enabled = false;
      if (reason === "missing module") data.householdModuleSettings = [];
      if (reason === "not member") data.householdMembers = [];
      if (reason === "deleted household" && data.households?.[0])
        data.households[0].deletedAt = now;
      const requests = [
        () => record({ sets: [recordedSet] }),
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
            args: { ...scope, changes: { notes: "No" } },
          }),
        () =>
          mutators.workouts.reorder.fn({
            tx,
            ctx,
            args: { ...scope, orderedWorkoutIds: [workoutId] },
          }),
      ];
      for (const request of requests)
        await expect(request()).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown or foreign workouts", async () => {
    const { data, record } = setup();
    if (data.workouts?.[0]) data.workouts[0].householdId = other;
    await expect(record()).rejects.toThrow("not allowed");
  });
  it("uses optimistic timestamps only on the client", async () => {
    const { data, record } = setup("client");
    await record();
    expect(data.workoutLogs?.[0]?.completedAt).toBe(1234);
  });
});
describe("workout ordering", () => {
  it.each(["server", "client"] as const)(
    "persists a shared order with %s timestamps",
    async (location) => {
      const { tx, data } = setup(location);
      data.workouts?.push({
        id: other,
        householdId,
        sortKey: 2048,
        ...structuredClone(starter),
      });
      await mutators.workouts.reorder.fn({
        tx,
        ctx,
        args: { ...scope, orderedWorkoutIds: [workoutId, other] },
      });
      expect(data.workouts?.[0]).toMatchObject({
        sortKey: 3072,
        updatedAt: location === "server" ? now : 1234,
      });
      expect(
        (
          await tx.run(
            queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
          )
        ).map((w) => w.id),
      ).toEqual([workoutId, other]);
    },
  );
  it("rejects foreign IDs instead of reordering across households", async () => {
    const { tx, data, writes } = setup();
    data.workouts?.push({
      id: other,
      householdId: other,
      sortKey: 2048,
      ...structuredClone(starter),
    });
    await expect(
      mutators.workouts.reorder.fn({
        tx,
        ctx,
        args: { ...scope, orderedWorkoutIds: [workoutId, other] },
      }),
    ).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it("keeps rows omitted by a stale client when rebalancing", async () => {
    const { tx, data } = setup();
    const added = crypto.randomUUID();
    data.workouts = [
      { id: workoutId, householdId, sortKey: 0, ...structuredClone(starter) },
      { id: other, householdId, sortKey: 2, ...structuredClone(starter) },
      { id: added, householdId, sortKey: 1, ...structuredClone(starter) },
    ];
    await mutators.workouts.reorder.fn({
      tx,
      ctx,
      args: { ...scope, orderedWorkoutIds: [other, workoutId, added] },
    });
    expect(data.workouts).toHaveLength(3);
    expect(
      (
        await tx.run(
          queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
        )
      ).map((w) => w.id),
    ).toEqual([other, workoutId, added]);
  });
  it("creates new workouts first and imports starters in A/B/C order", async () => {
    const { tx, data } = setup();
    await mutators.workouts.create.fn({
      tx,
      ctx,
      args: { ...scope, workoutId: other, title: "New" },
    });
    expect(data.workouts?.find((w) => w.id === other)?.sortKey).toBe(2048);
    const ids: [string, string, string] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    await mutators.workouts.importStarters.fn({
      tx,
      ctx,
      args: { householdId, workoutIds: ids, optimisticTimestamp: 1 },
    });
    const rows = await tx.run(
      queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
    );
    expect(rows.map((w) => w.id)).toEqual([...ids, other, workoutId]);
  });
});
describe("private log queries", () => {
  it("shares definitions but never another user's log, note or sets", async () => {
    const { data, tx, record } = setup();
    await record({ sets: [recordedSet] });
    data.workoutLogs?.push({
      ...data.workoutLogs[0],
      id: other,
      userId: other,
      note: "SECRET",
    });
    data.workoutLogSets?.push({
      logId: other,
      exerciseId: other,
      round: 1,
      values: { note: "SECRET" },
    });
    expect(
      await tx.run(
        queries.workouts.byHousehold.fn({ args: { householdId }, ctx }),
      ),
    ).toHaveLength(1);
    const logs = await tx.run(
      queries.workouts.logs.fn({ args: { householdId, workoutId }, ctx }),
    );
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("SECRET");
  });
  it.each(["module", "membership", "household"])(
    "blocks queries after losing %s access",
    async (reason) => {
      const { data, tx, record } = setup();
      await record();
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
          queries.workouts.logs.fn({ args: { householdId, workoutId }, ctx }),
        ),
      ).toHaveLength(0);
    },
  );
});
