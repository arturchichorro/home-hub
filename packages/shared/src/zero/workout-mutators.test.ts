import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starterWorkouts } from "../workout-seed";
import {
  normalizeExerciseName,
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
    exercises: starter.exercises.map((e) => ({
      id: e.id,
      householdId,
      name: e.name,
      normalizedName: normalizeExerciseName(e.name),
      unit: e.unit,
      load: e.load,
      unilateral: e.unilateral,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })),
    workoutExercises: starter.exercises.map((exercise, index) => ({
      id: exercise.id,
      exerciseId: exercise.id,
      sets: exercise.sets,
      target: exercise.target,
      householdId,
      workoutId,
      sortKey: (starter.exercises.length - index) * 1024,
      createdAt: now,
      updatedAt: now,
    })),
    workoutLogs: [],
    workoutLogSets: [],
    exerciseMedia: [],
    media: [],
  };
  const writes = vi.fn();
  const sameKey = (table: string, a: Row, b: Row) =>
    table === "workoutExercises"
      ? a.workoutId === b.workoutId && a.id === b.id
      : table === "workoutLogSets"
        ? a.logId === b.logId &&
          a.workoutExerciseId === b.workoutExerciseId &&
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
      [
        "workouts",
        "exercises",
        "workoutExercises",
        "workoutLogs",
        "workoutLogSets",
        "exerciseMedia",
      ].map((t) => [t, crud(t)]),
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
            : ast.table === "exerciseMedia"
              ? {
                  ...r,
                  asset: (data.media ?? []).find(
                    (asset) =>
                      asset.id === r.mediaId &&
                      asset.householdId === r.householdId,
                  ),
                }
              : ast.table === "workouts"
                ? {
                    ...r,
                    exercises: (data.workoutExercises ?? [])
                      .filter(
                        (e) =>
                          e.workoutId === r.id &&
                          e.householdId === r.householdId,
                      )
                      .map((e) => ({
                        ...e,
                        exercise: (data.exercises ?? []).find(
                          (x) =>
                            x.id === e.exerciseId &&
                            x.householdId === e.householdId,
                        ),
                      }))
                      .sort(
                        (a: Row, b: Row) =>
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
  workoutExerciseId: starter.exercises[0]?.id ?? "",
  round: 1,
  values: { weightKg: 8, amount: 10, rightAmount: null },
};
describe("exercise picture ordering", () => {
  function mediaSetup(location: "server" | "client" = "server") {
    const context = setup(location);
    const exerciseId = String(context.data.exercises?.[0]?.id);
    const ids = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    context.data.exerciseMedia = ids.map((id, index) => ({
      id,
      householdId,
      exerciseId,
      mediaId: crypto.randomUUID(),
      sortKey: [4, 2, 3, 1][index],
      deletedAt: null,
    }));
    context.data.media = context.data.exerciseMedia.map((row, index) => ({
      id: row.mediaId,
      householdId,
      kind: "image",
      confirmedAt: index === 3 ? null : now,
      deletedAt: null,
    }));
    const move = (
      orderedAttachmentIds: string[],
      attachmentId = ids[0] ?? "",
    ) =>
      mutators.workouts.reorderExerciseMedia.fn({
        tx: context.tx,
        ctx,
        args: {
          householdId,
          exerciseId,
          attachmentId,
          orderedAttachmentIds,
          optimisticTimestamp: 1234,
        },
      });
    const order = () =>
      [...(context.data.exerciseMedia ?? [])]
        .sort((a, b) => Number(b.sortKey) - Number(a.sortKey))
        .map((row) => row.id);
    return {
      ...context,
      ids: ids as [string, string, string, string],
      exerciseId,
      move,
      order,
    };
  }
  it.each(["client", "server"] as const)(
    "optimistically/server-orders one picture with sparse keys: %s",
    async (location) => {
      const { ids, move, data, writes } = mediaSetup(location);
      await move([ids[1], ids[0], ids[2]], ids[1]);
      expect(
        data.exerciseMedia?.find((row) => row.id === ids[1])?.sortKey,
      ).toBe(1028);
      expect(
        writes.mock.calls.filter(([table]) => table === "exerciseMedia"),
      ).toEqual([
        [
          "exerciseMedia",
          "update",
          {
            id: ids[1],
            sortKey: 1028,
            updatedAt: location === "server" ? now : 1234,
          },
        ],
      ]);
    },
  );
  it("rebalances the entire scope without losing pending or unseen uploads", async () => {
    const state = mediaSetup();
    const { ids, data } = state;
    const extraId = crypto.randomUUID(),
      assetId = crypto.randomUUID();
    data.exerciseMedia?.push({
      id: extraId,
      householdId,
      exerciseId: state.exerciseId,
      mediaId: assetId,
      sortKey: 6,
      deletedAt: null,
    });
    data.media?.push({
      id: assetId,
      householdId,
      kind: "image",
      confirmedAt: now,
      deletedAt: null,
    });
    data.workoutLogs = [{ id: logId, note: "Keep private notes", snapshot }];
    const assetsBefore = JSON.stringify(data.media),
      logsBefore = JSON.stringify(data.workoutLogs);
    await state.move([ids[2], ids[0], ids[1]]);
    expect(state.order()).toEqual([extraId, ids[2], ids[0], ids[1], ids[3]]);
    expect(JSON.stringify(data.media)).toBe(assetsBefore);
    expect(JSON.stringify(data.workoutLogs)).toBe(logsBefore);
  });
  it.each(["deleted", "pending", "asset-deleted", "video", "foreign"])(
    "rejects non-visible or foreign attachment IDs: %s",
    async (kind) => {
      const state = mediaSetup();
      const { data, ids } = state;
      const row = data.exerciseMedia?.[1],
        asset = data.media?.[1];
      if (!row || !asset) throw new Error("fixture");
      if (kind === "deleted") row.deletedAt = now;
      if (kind === "pending") asset.confirmedAt = null;
      if (kind === "asset-deleted") asset.deletedAt = now;
      if (kind === "video") asset.kind = "video";
      if (kind === "foreign") row.exerciseId = crypto.randomUUID();
      await expect(
        state.move([ids[1], ids[0], ids[2]], ids[1]),
      ).rejects.toThrow("Exercise media reorder not allowed");
      expect(state.writes).not.toHaveBeenCalled();
    },
  );
  it.each(["membership", "module", "archived"])(
    "rejects unavailable media scope: %s",
    async (kind) => {
      const state = mediaSetup();
      if (kind === "membership") state.data.householdMembers = [];
      if (kind === "module") state.data.householdModuleSettings = [];
      if (kind === "archived") {
        const parent = state.data.exercises?.[0];
        if (parent) parent.archived = true;
      }
      await expect(
        state.move([state.ids[1], state.ids[0], state.ids[2]], state.ids[1]),
      ).rejects.toThrow();
      expect(state.writes).not.toHaveBeenCalled();
    },
  );
  it.each(["archive", "delete"])(
    "rechecks catalog/attachments after acquiring the parent lock: %s",
    async (change) => {
      const state = mediaSetup();
      state.writes.mockImplementationOnce(() => {
        const row =
          change === "archive"
            ? state.data.exercises?.[0]
            : state.data.exerciseMedia?.[1];
        if (row) {
          if (change === "archive") row.archived = true;
          else row.deletedAt = now;
        }
      });
      await expect(
        state.move([state.ids[1], state.ids[0], state.ids[2]], state.ids[1]),
      ).rejects.toThrow();
      expect(
        state.writes.mock.calls.some(([table]) => table === "exerciseMedia"),
      ).toBe(false);
    },
  );
});
describe("shared exercise catalog", () => {
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
  it("imports one catalog identity per name and links exercises across workouts", async () => {
    const { tx, data } = setup();
    data.workouts = [];
    data.workoutExercises = [];
    data.exercises = [];
    const workoutIds: [string, string, string] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    const catalogExerciseIds = [
      ...new Set(
        starterWorkouts.flatMap((w) =>
          w.exercises.map((e) => normalizeExerciseName(e.name)),
        ),
      ),
    ].map(() => crypto.randomUUID());
    await mutators.workouts.importStarters.fn({
      tx,
      ctx,
      args: {
        householdId,
        workoutIds,
        catalogExerciseIds,
        optimisticTimestamp: 1,
      },
    });
    expect(data.workoutExercises).toHaveLength(18);
    expect(data.exercises).toHaveLength(catalogExerciseIds.length);
    const grouped = data.workoutExercises?.filter((row) => row.id === first.id);
    expect(new Set(grouped?.map((row) => row.exerciseId)).size).toBe(1);
    const detail = await tx.run(
      queries.workouts.detail.fn({
        ctx,
        args: { householdId, workoutId: workoutIds[0] },
      }),
    );
    expect(detail?.exercises.map((row) => row.exercise?.name)).toEqual(
      starter.exercises.map((e) => e.name),
    );
  });
  it("shares name/measure/load/sides but keeps prescriptions local", async () => {
    const { tx, data } = setup();
    data.workouts?.push({
      id: other,
      householdId,
      title: "Other workout",
      notes: "",
      sortKey: 0,
    });
    data.workoutExercises?.push({
      ...data.workoutExercises[0],
      workoutId: other,
      sets: 4,
      target: "Other target",
    });
    await edit(tx, {
      updates: [
        {
          exerciseId: first.id,
          changes: {
            name: "Renamed movement",
            unit: "seconds",
            load: "bodyweight",
            unilateral: true,
            sets: 3,
            target: "20–30",
          },
        },
      ],
    });
    expect(data.exercises?.find((e) => e.id === first.id)).toMatchObject({
      name: "Renamed movement",
      unit: "seconds",
      load: "bodyweight",
      unilateral: true,
    });
    expect(
      data.workoutExercises?.find(
        (e) => e.id === first.id && e.workoutId === workoutId,
      ),
    ).toMatchObject({ sets: 3, target: "20–30" });
    expect(
      data.workoutExercises?.find((e) => e.workoutId === other),
    ).toMatchObject({ sets: 4, target: "Other target" });
    const detail = await tx.run(
      queries.workouts.detail.fn({
        ctx,
        args: { householdId, workoutId: other },
      }),
    );
    expect(detail?.exercises[0]?.exercise?.name).toBe("Renamed movement");
  });
  it("reuses matching case/whitespace names when adding a new slot", async () => {
    const { tx, data } = setup();
    const count = data.exercises?.length;
    await edit(tx, {
      creates: [
        {
          ...first,
          id: crypto.randomUUID(),
          catalogExerciseId: crypto.randomUUID(),
          name: "  GOBLET   SQUAT  ",
        },
      ],
    });
    expect(data.exercises).toHaveLength(count ?? 0);
    expect(data.workoutExercises?.at(-1)?.exerciseId).toBe(first.id);
  });
  it("updates settings without rewriting the name or normalized key", async () => {
    const { tx, writes } = setup();
    await mutators.workouts.updateExercise.fn({
      tx,
      ctx,
      args: {
        householdId,
        exerciseId: first.id,
        optimisticTimestamp: 1,
        changes: { unit: "seconds" },
      },
    });
    const payload = writes.mock.calls.find(
      (call) => call[0] === "exercises",
    )?.[2];
    expect(payload).toMatchObject({ unit: "seconds" });
    expect(payload).not.toHaveProperty("normalizedName");
    expect(payload).not.toHaveProperty("name");
  });
  it("does not let stale linking data overwrite current catalog details", async () => {
    const { tx, data } = setup();
    const row = data.exercises?.[0];
    if (!row) throw new Error("catalog");
    row.name = "Remote name";
    row.normalizedName = "remote name";
    await edit(tx, {
      creates: [
        { ...first, id: crypto.randomUUID(), catalogExerciseId: first.id },
      ],
    });
    expect(row.name).toBe("Remote name");
  });
  it("deleting a slot preserves the catalog, numeric sets and immutable history", async () => {
    const { tx, data, record } = setup();
    await record({ sets: [recordedSet] });
    const logs = structuredClone(data.workoutLogs),
      sets = structuredClone(data.workoutLogSets);
    await edit(tx, { deletes: [first.id] });
    expect(data.exercises?.some((e) => e.id === first.id)).toBe(true);
    expect(data.workoutLogs).toEqual(logs);
    expect(data.workoutLogSets).toEqual(sets);
  });
  it("hides historical-only catalog entries and safely promotes explicitly named creations", async () => {
    const { tx, data } = setup();
    data.exercises?.push({
      ...data.exercises[0],
      id: other,
      name: "Private historical movement",
      normalizedName: "private historical movement",
      archived: true,
    });
    const before = await tx.run(
      queries.workouts.catalog.fn({ ctx, args: { householdId } }),
    );
    expect(before.some((e) => e.id === other)).toBe(false);
    await edit(tx, {
      creates: [
        {
          ...first,
          id: crypto.randomUUID(),
          catalogExerciseId: crypto.randomUUID(),
          name: "Private historical movement",
          unit: "seconds",
        },
      ],
    });
    expect(data.exercises?.find((e) => e.id === other)).toMatchObject({
      archived: false,
      unit: "seconds",
    });
  });
  it.each(["module", "membership", "household"])(
    "blocks catalog reads and edits without %s access",
    async (reason) => {
      const { tx, data, writes } = setup();
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      expect(
        await tx.run(
          queries.workouts.catalog.fn({ ctx, args: { householdId } }),
        ),
      ).toHaveLength(0);
      await expect(
        edit(tx, {
          updates: [{ exerciseId: first.id, changes: { name: "No" } }],
        }),
      ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("rejects an exercise ID from another workout scope", async () => {
    const { tx, data, writes } = setup();
    data.workoutExercises?.push({
      ...data.workoutExercises[0],
      id: other,
      workoutId: other,
    });
    await expect(edit(tx, { deletes: [other] })).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
});
describe("completed workout logs", () => {
  it("keeps a stable catalog ID and original measurements after shared edits", async () => {
    const { tx, data, record } = setup();
    await record({ sets: [recordedSet] });
    const first = starter.exercises[0];
    if (!first) throw new Error("seed");
    await mutators.workouts.updateExercise.fn({
      tx,
      ctx,
      args: {
        householdId,
        exerciseId: first.id,
        optimisticTimestamp: 1,
        changes: { name: "Renamed movement", unit: "seconds" },
      },
    });
    data.workouts?.push({
      id: other,
      householdId,
      title: "Another workout",
      notes: "",
      sortKey: 0,
    });
    data.workoutExercises?.push({
      id: other,
      workoutId: other,
      householdId,
      exerciseId: first.id,
      sets: 2,
      target: "20",
      sortKey: 0,
    });
    await record({
      workoutId: other,
      logId: crypto.randomUUID(),
      snapshot: {
        title: "Another workout",
        exercises: [
          {
            ...first,
            id: other,
            catalogExerciseId: first.id,
            name: "Renamed movement",
            unit: "seconds",
          },
        ],
      },
      sets: [
        {
          workoutExerciseId: other,
          round: 1,
          values: { amount: 20, weightKg: null, rightAmount: null },
        },
      ],
    });
    expect(
      new Set(data.workoutLogSets?.map((row) => row.exerciseId)).size,
    ).toBe(1);
    expect(data.workoutLogSets?.map((row) => row.unit)).toEqual([
      "reps",
      "seconds",
    ]);
    expect(
      data.workoutLogSets
        ?.filter((row) => row.unit === "reps")
        .reduce((sum, row) => sum + Number(row.amount), 0),
    ).toBe(10);
    expect(
      workoutLogSnapshotSchema.parse(data.workoutLogs?.[0]?.snapshot)
        .exercises[0]?.name,
    ).toBe(first.name);
  });

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
    expect(data.workoutLogSets?.[0]).toMatchObject({
      amount: 10,
      weightKg: 8,
      rightAmount: null,
      exerciseId: starter.exercises[0]?.id,
      workoutExerciseId: recordedSet.workoutExerciseId,
      unit: "reps",
    });
    expect(data.workoutLogSets?.[0]).not.toHaveProperty("values");
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
      amount: 12,
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
    expect(data.workoutLogSets?.[0]).toMatchObject({ amount: 11 });
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
      workoutExerciseId: string;
      round: number;
      values: WorkoutSetValues;
    } = { ...recordedSet, round: 2, values: { ...recordedSet.values } };
    if (reason === "unknown exercise") invalid.workoutExerciseId = other;
    if (reason === "too many sets") invalid.round = 3;
    if (reason === "wrong side") invalid.values.rightAmount = 8;
    if (reason === "bodyweight load") invalid.workoutExerciseId = bodyweight.id;
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
      args: {
        householdId,
        workoutIds: ids,
        catalogExerciseIds: [
          ...new Set(
            starterWorkouts.flatMap((w) =>
              w.exercises.map((e) => normalizeExerciseName(e.name)),
            ),
          ),
        ].map(() => crypto.randomUUID()),
        optimisticTimestamp: 1,
      },
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
