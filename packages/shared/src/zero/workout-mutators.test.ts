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
        title: starter.title,
        notes: starter.notes,
      },
    ],
    workoutExercises: starter.exercises.map((exercise, index) => ({
      ...structuredClone(exercise),
      householdId,
      workoutId,
      sortKey: (starter.exercises.length - index) * 1024,
      createdAt: now,
      updatedAt: now,
    })),
    workoutLogs: [],
    workoutLogSets: [],
  };
  const writes = vi.fn();
  const sameKey = (table: string, a: Row, b: Row) =>
    table === "workoutExercises"
      ? a.workoutId === b.workoutId && a.id === b.id
      : table === "workoutLogSets"
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
      ["workouts", "workoutExercises", "workoutLogs", "workoutLogSets"].map(
        (t) => [t, crud(t)],
      ),
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
            : ast.table === "workouts"
              ? {
                  ...r,
                  exercises: (data.workoutExercises ?? [])
                    .filter(
                      (e) =>
                        e.workoutId === r.id && e.householdId === r.householdId,
                    )
                    .sort(
                      (a, b) =>
                        Number(b.sortKey) - Number(a.sortKey) ||
                        String(a.id).localeCompare(String(b.id)),
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
describe("normalized workout exercises", () => {
  const first = starter.exercises[0];
  if (!first) throw new Error("seed");
  const edit = (
    tx: Transaction<Schema>,
    changes: Partial<
      Parameters<typeof mutators.workouts.editExercises.fn>[0]["args"]
    >,
  ) =>
    mutators.workouts.editExercises.fn({
      tx,
      ctx,
      args: { ...scope, creates: [], updates: [], deletes: [], ...changes },
    });
  it("imports starter exercises as scoped rows in their original order", async () => {
    const { tx, data } = setup();
    data.workouts = [];
    data.workoutExercises = [];
    const workoutIds: [string, string, string] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    await mutators.workouts.importStarters.fn({
      tx,
      ctx,
      args: { householdId, workoutIds, optimisticTimestamp: 1234 },
    });
    expect(data.workouts).toHaveLength(3);
    expect(data.workoutExercises).toHaveLength(18);
    for (const [i, content] of starterWorkouts.entries()) {
      expect(
        data.workouts?.find((w) => w.id === workoutIds[i]),
      ).not.toHaveProperty("exercises");
      const detail = await tx.run(
        queries.workouts.detail.fn({
          ctx,
          args: { householdId, workoutId: workoutIds[i] ?? "" },
        }),
      );
      expect(detail?.exercises.map((e) => e.id)).toEqual(
        content.exercises.map((e) => e.id),
      );
    }
  });
  it("patches a single field without overwriting concurrent fields or unseen additions", async () => {
    const { tx, data, writes } = setup();
    const row = data.workoutExercises?.find((e) => e.id === first.id);
    if (!row) throw new Error("row");
    row.target = "Remote target";
    data.workoutExercises?.push({
      ...row,
      id: other,
      name: "Concurrent addition",
    });
    writes.mockClear();
    await edit(tx, {
      updates: [{ exerciseId: first.id, changes: { name: "Local name" } }],
    });
    expect(row).toMatchObject({ name: "Local name", target: "Remote target" });
    expect(data.workoutExercises).toHaveLength(7);
    expect(writes).toHaveBeenCalledTimes(2);
    expect(
      writes.mock.calls.find((call) => call[0] === "workoutExercises")?.[2],
    ).toEqual({
      workoutId,
      id: first.id,
      name: "Local name",
      updatedAt: now,
    });
  });
  it("appends rows and scopes reused exercise IDs to the owning workout", async () => {
    const { tx, data } = setup();
    const original = data.workoutExercises?.[0];
    if (!original) throw new Error("row");
    data.workouts?.push({
      id: other,
      householdId,
      title: "Other",
      notes: "",
      sortKey: 0,
    });
    data.workoutExercises?.push({
      ...original,
      workoutId: other,
      name: "Other workout exercise",
    });
    await edit(tx, {
      updates: [{ exerciseId: first.id, changes: { name: "Changed" } }],
      creates: [{ ...first, id: crypto.randomUUID(), name: "Appended" }],
    });
    expect(
      data.workoutExercises?.find((e) => e.workoutId === other)?.name,
    ).toBe("Other workout exercise");
    const detail = await tx.run(
      queries.workouts.detail.fn({ ctx, args: { householdId, workoutId } }),
    );
    expect(detail?.exercises.at(-1)?.name).toBe("Appended");
  });
  it("deletes editable exercises without modifying recorded snapshots or sets", async () => {
    const { tx, data, record } = setup();
    await record({ sets: [recordedSet] });
    const logs = structuredClone(data.workoutLogs),
      sets = structuredClone(data.workoutLogSets);
    await edit(tx, { deletes: [first.id] });
    expect(
      data.workoutExercises?.some(
        (e) => e.workoutId === workoutId && e.id === first.id,
      ),
    ).toBe(false);
    expect(data.workoutLogs).toEqual(logs);
    expect(data.workoutLogSets).toEqual(sets);
  });
  it.each(["update", "delete"])(
    "rejects an out-of-scope exercise %s before any writes",
    async (action) => {
      const { tx, data, writes } = setup();
      data.workoutExercises?.push({
        ...data.workoutExercises[0],
        id: other,
        workoutId: other,
      });
      await expect(
        edit(
          tx,
          action === "update"
            ? { updates: [{ exerciseId: other, changes: { name: "No" } }] }
            : { deletes: [other] },
        ),
      ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it.each(["module", "membership", "household"])(
    "does not expose related exercises without %s access",
    async (reason) => {
      const { tx, data } = setup();
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      expect(
        await tx.run(
          queries.workouts.detail.fn({ ctx, args: { householdId, workoutId } }),
        ),
      ).toBeUndefined();
    },
  );
  it("rejects additions over the workout limit before writing", async () => {
    const { tx, data, writes } = setup();
    data.workoutExercises = Array.from({ length: 40 }, (_, i) => ({
      ...data.workoutExercises?.[0],
      id: i === 0 ? first.id : crypto.randomUUID(),
    }));
    await expect(
      edit(tx, { creates: [{ ...first, id: crypto.randomUUID() }] }),
    ).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["module", "membership", "household", "workout"])(
    "blocks exercise edits outside available %s scope",
    async (reason) => {
      const { tx, data, writes } = setup();
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      if (reason === "workout" && data.workouts?.[0])
        data.workouts[0].householdId = other;
      await expect(
        edit(tx, {
          updates: [{ exerciseId: first.id, changes: { target: "No" } }],
        }),
      ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
});
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
describe("private notes added after completion", () => {
  const noteArgs = {
    householdId,
    workoutId,
    logId,
    note: "  Felt good.\nWrist rehab.  ",
  };
  it("updates only the existing note, not sets, snapshot or completion date", async () => {
    const { tx, data, record, writes } = setup();
    await record({ sets: [recordedSet] });
    const before = structuredClone(data.workoutLogs?.[0]);
    const sets = structuredClone(data.workoutLogSets);
    writes.mockClear();
    await mutators.workouts.updateLogNote.fn({ tx, ctx, args: noteArgs });
    expect(data.workoutLogs?.[0]).toEqual({
      ...before,
      note: "Felt good.\nWrist rehab.",
    });
    expect(data.workoutLogSets).toEqual(sets);
    expect(writes).toHaveBeenCalledTimes(1);
    await mutators.workouts.saveLog.fn({
      tx,
      ctx,
      args: {
        ...scope,
        logId,
        snapshot,
        sets: [],
        timeZone: "Europe/Brussels",
      },
    });
    expect(data.workoutLogs?.[0]?.note).toBe("Felt good.\nWrist rehab.");
    await mutators.workouts.updateLogNote.fn({
      tx,
      ctx,
      args: { ...noteArgs, note: "" },
    });
    expect(data.workoutLogs?.[0]?.note).toBe("");
  });
  it.each([
    "missing log",
    "foreign user",
    "foreign household",
    "foreign workout",
  ])("rejects %s without creating or modifying logs", async (reason) => {
    const { tx, data, record, writes } = setup();
    if (reason !== "missing log") {
      await record({ note: "Original" });
      const row = data.workoutLogs?.[0];
      if (!row) throw new Error("log");
      if (reason === "foreign user") row.userId = other;
      if (reason === "foreign household") row.householdId = other;
      if (reason === "foreign workout") row.workoutId = other;
    }
    writes.mockClear();
    await expect(
      mutators.workouts.updateLogNote.fn({ tx, ctx, args: noteArgs }),
    ).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["module", "membership", "household"])(
    "rejects notes after losing %s access",
    async (reason) => {
      const { tx, data, record, writes } = setup();
      await record();
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      writes.mockClear();
      await expect(
        mutators.workouts.updateLogNote.fn({ tx, ctx, args: noteArgs }),
      ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
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
