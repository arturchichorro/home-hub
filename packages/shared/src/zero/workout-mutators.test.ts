import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logOnlyWorkoutExercise, type SaveExerciseSet } from "../exercise-logs";
import { starterWorkouts } from "../workout-seed";
import {
  normalizeExerciseName,
  workoutContentSchema,
  workoutLogSnapshotSchema,
} from "../workouts";
import { mutators } from "./mutators";
import { queries } from "./queries";
import type { Schema } from "./schema.gen";

const householdId = crypto.randomUUID();

const userId = crypto.randomUUID();

const other = crypto.randomUUID();

const workoutId = crypto.randomUUID();

const logId = crypto.randomUUID();

const now = Date.parse("2026-10-25T23:30:00Z");

const ctx = { userId };

const scope = { householdId, workoutId, optimisticTimestamp: 1234 };

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
  if (!condition) {
    return true;
  }

  if (condition.type === "and") {
    return condition.conditions.every((c) => matches(row, c, data));
  }

  if (condition.type === "correlatedSubquery") {
    const { correlation, subquery } = condition.related;

    return (data[subquery.table] ?? []).some(
      (r) =>
        correlation.parentField.every(
          (field, i) => row[field] === r[correlation.childField[i] ?? ""],
        ) && matches(r, subquery.where, data),
    );
  }

  if (condition.op === "IS" && condition.right.value === null) {
    return row[condition.left.name] == null;
  }

  if (condition.op === "=") {
    return row[condition.left.name] === condition.right.value;
  }

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

    exercises: starter.exercises.map((e, index) => ({
      id: e.id,
      householdId,
      name: e.name,
      normalizedName: normalizeExerciseName(e.name),
      unit: e.unit,
      load: e.load,
      unilateral: e.unilateral,
      deletedAt: null,
      sortKey: (starter.exercises.length - index) * 1024,
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
    exerciseLogs: [],
    exerciseLogSets: [],
    workoutLogExercises: [],
    exerciseMedia: [],
    media: [],
  };
  const writes = vi.fn();
  const sameKey = (table: string, a: Row, b: Row) =>
    table === "workoutExercises"
      ? a.workoutId === b.workoutId && a.id === b.id
      : table === "exerciseLogSets"
        ? a.exerciseLogId === b.exerciseLogId && a.round === b.round
        : table === "workoutLogExercises"
          ? a.workoutLogId === b.workoutLogId &&
            a.workoutExerciseId === b.workoutExerciseId
          : table === "workoutLogSets"
            ? a.logId === b.logId &&
              a.workoutExerciseId === b.workoutExerciseId &&
              a.round === b.round
            : a.id === b.id;
  const crud = (table: string) => ({
    insert: async (row: Row) => {
      if (data[table]?.some((r) => sameKey(table, r, row))) {
        throw new Error("duplicate");
      }

      writes(table, "insert", row);
      data[table]?.push(structuredClone(row));
    },

    update: async (row: Row) => {
      if (table !== "households") {
        writes(table, "update", row); // Household UPDATE only serializes catalog writes.
      }

      const found = data[table]?.find((r) => sameKey(table, r, row));

      if (found) {
        Object.assign(found, structuredClone(row));
      }
    },

    delete: async (row: Row) => {
      writes(table, "delete", row);
      data[table] = (data[table] ?? []).filter((r) => !sameKey(table, r, row));
    },

    upsert: async (row: Row) => {
      writes(table, "upsert", row);

      const found = data[table]?.find((r) => sameKey(table, r, row));

      if (found) {
        Object.assign(found, structuredClone(row));
      } else {
        data[table]?.push(structuredClone(row));
      }
    },
  });
  const tx = {
    location,
    mutate: Object.fromEntries(
      [
        "households",
        "workouts",
        "exercises",
        "workoutExercises",
        "workoutLogs",
        "workoutLogSets",
        "exerciseLogs",
        "exerciseLogSets",
        "workoutLogExercises",
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

      for (const [field, direction] of [...(ast.orderBy ?? [])].reverse()) {
        rows.sort((a, b) => {
          const av = a[field] as string | number;
          const bv = b[field] as string | number;

          return (
            (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1)
          );
        });
      }

      return format.singular ? rows[0] : rows;
    },
  } as unknown as Transaction<Schema>;
  // Historical archive fixtures are not produced by the retired bulk writer.
  // Use canonical row writes, then seed the immutable pre-cutover archive.
  const record = async (
    changes: Partial<
      Parameters<typeof mutators.workouts.saveLog.fn>[0]["args"]
    > = {},
  ) => {
    const args = {
      ...scope,
      logId,
      snapshot,
      note: "",
      sets: [],
      timeZone: "Europe/Brussels",
      ...changes,
    };

    for (const set of args.sets) {
      await mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: {
          householdId: args.householdId,
          workoutId: args.workoutId,
          logId: args.logId,
          snapshot: args.snapshot,
          completedOn: "2026-10-26",
          timeZone: args.timeZone,
          optimisticTimestamp: now,
          workoutExerciseId: set.workoutExerciseId,
          exerciseLogId: crypto.randomUUID(),
          round: set.round,
          values: set.values,
        },
      });
    }

    let log = data.workoutLogs?.find((row) => row.id === args.logId);

    if (!log) {
      log = {
        id: args.logId,
        householdId,
        workoutId: args.workoutId,
        userId,
        snapshot: args.snapshot,
        completedOn: "2026-10-26",
        completedAt: now,
        createdAt: now,
      };
      data.workoutLogs?.push(log);
    }

    log.note = args.note;

    for (const set of args.sets) {
      if (
        data.workoutLogSets?.some(
          (row) =>
            row.logId === log.id &&
            row.workoutExerciseId === set.workoutExerciseId &&
            row.round === set.round,
        )
      ) {
        continue;
      }

      const definition = args.snapshot.exercises.find(
        (row) => row.id === set.workoutExerciseId,
      );

      if (!definition) {
        throw Error("Missing fixture definition");
      }

      data.workoutLogSets?.push({
        logId: log.id,
        householdId,
        workoutExerciseId: set.workoutExerciseId,
        exerciseId: definition.catalogExerciseId ?? definition.id,
        round: set.round,
        ...set.values,
        unit: definition.unit,
        load: definition.load,
        unilateral: definition.unilateral,
      });
    }
  };

  return { tx, data, writes, record };
}

afterEach(() => vi.restoreAllMocks());

function fixtureRow(rows: Row[] | undefined) {
  const row = rows?.[0];

  if (!row) {
    throw Error("Missing fixture row");
  }

  return row;
}

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
    const extraId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
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

    const assetsBefore = JSON.stringify(data.media);
    const logsBefore = JSON.stringify(data.workoutLogs);
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
      const row = data.exerciseMedia?.[1];
      const asset = data.media?.[1];

      if (!row || !asset) {
        throw new Error("fixture");
      }

      if (kind === "deleted") {
        row.deletedAt = now;
      }

      if (kind === "pending") {
        asset.confirmedAt = null;
      }

      if (kind === "asset-deleted") {
        asset.deletedAt = now;
      }

      if (kind === "video") {
        asset.kind = "video";
      }

      if (kind === "foreign") {
        row.exerciseId = crypto.randomUUID();
      }

      await expect(
        state.move([ids[1], ids[0], ids[2]], ids[1]),
      ).rejects.toThrow("Exercise media reorder not allowed");
      expect(state.writes).not.toHaveBeenCalled();
    },
  );
  it.each(["membership", "module", "deleted-parent"])(
    "rejects unavailable media scope: %s",
    async (kind) => {
      const state = mediaSetup();

      if (kind === "membership") {
        state.data.householdMembers = [];
      }

      if (kind === "module") {
        state.data.householdModuleSettings = [];
      }

      if (kind === "deleted-parent") {
        const parent = state.data.exercises?.[0];

        if (parent) {
          parent.deletedAt = now;
        }
      }

      await expect(
        state.move([state.ids[1], state.ids[0], state.ids[2]], state.ids[1]),
      ).rejects.toThrow();
      expect(state.writes).not.toHaveBeenCalled();
    },
  );
  it.each(["delete-parent", "delete"])(
    "rechecks catalog/attachments after acquiring the parent lock: %s",
    async (change) => {
      const state = mediaSetup();
      state.writes.mockImplementationOnce(() => {
        const row =
          change === "delete-parent"
            ? state.data.exercises?.[0]
            : state.data.exerciseMedia?.[1];

        if (row) {
          if (change === "delete-parent") {
            row.deletedAt = now;
          } else {
            row.deletedAt = now;
          }
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

describe("standalone exercise creation", () => {
  const definition = () => ({
    id: crypto.randomUUID(),
    name: "Cable row",
    unit: "reps" as const,
    load: "single" as const,
    unilateral: false,
  });
  const create = (
    tx: Transaction<Schema>,
    exercise = definition(),
    targetHousehold = householdId,
  ) =>
    mutators.workouts.createExercise.fn({
      tx,
      ctx,
      args: {
        householdId: targetHousehold,
        exercise,
        optimisticTimestamp: 1234,
      },
    });
  it.each(["client", "server"] as const)(
    "creates an exercise without a workout slot: %s",
    async (location) => {
      const { tx, data, writes } = setup(location);
      const exercise = definition();
      const workoutsBefore = JSON.stringify(data.workouts);
      const slotsBefore = JSON.stringify(data.workoutExercises);
      await create(tx, exercise);
      expect(
        data.exercises?.find((row) => row.id === exercise.id),
      ).toMatchObject({
        ...exercise,
        householdId,
        normalizedName: "cable row",
        deletedAt: null,
        createdAt: location === "server" ? now : 1234,
      });
      expect(JSON.stringify(data.workouts)).toBe(workoutsBefore);
      expect(JSON.stringify(data.workoutExercises)).toBe(slotsBefore);
      expect(writes.mock.calls.every(([table]) => table === "exercises")).toBe(
        true,
      );
    },
  );
  it("rejects normalized duplicates without changing the existing exercise", async () => {
    const { tx, data, writes } = setup();
    const existing = data.exercises?.[0];

    if (!existing) {
      throw Error("fixture");
    }

    await expect(
      create(tx, {
        ...definition(),
        name: `  ${String(existing.name).toUpperCase()}  `,
      }),
    ).rejects.toThrow("already exists");
    expect(writes).not.toHaveBeenCalled();
  });
  it("never revives deleted identities and allows a fresh exercise with the same name", async () => {
    const { tx, data } = setup();
    const old = definition();
    data.exercises?.push({
      ...old,
      householdId,
      normalizedName: "cable row",
      deletedAt: now,
      unit: "seconds",
      load: "bodyweight",
      unilateral: true,
      sortKey: 0,
    });

    const exercise = definition();
    await create(tx, exercise);
    expect(
      data.exercises?.filter((row) => row.normalizedName === "cable row"),
    ).toHaveLength(2);
    expect(data.exercises?.find((row) => row.id === old.id)).toMatchObject({
      deletedAt: now,
      unit: "seconds",
    });
    expect(data.exercises?.find((row) => row.id === exercise.id)).toMatchObject(
      { ...exercise, deletedAt: null },
    );
    await expect(create(tx, old)).rejects.toThrow("no longer available");
  });
  it("is idempotent and never overwrites settings on retried creation", async () => {
    const { tx, data, writes } = setup();
    const exercise = definition();
    await create(tx, exercise);

    const row = data.exercises?.find((row) => row.id === exercise.id);

    if (!row) {
      throw Error("fixture");
    }

    row.unilateral = true;
    writes.mockClear();
    await create(tx, exercise);
    expect(row.unilateral).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    await expect(
      create(tx, { ...exercise, name: "A different movement" }),
    ).rejects.toThrow("ID already in use");
  });
  it.each(["membership", "module", "foreign"] as const)(
    "requires active household/module authorization: %s",
    async (kind) => {
      const { tx, data, writes } = setup();

      if (kind === "membership") {
        data.householdMembers = [];
      }

      if (kind === "module") {
        data.householdModuleSettings = [];
      }

      await expect(
        create(tx, definition(), kind === "foreign" ? other : householdId),
      ).rejects.toThrow();
      expect(writes).not.toHaveBeenCalled();
    },
  );
});

describe("catalog deletion and ordering", () => {
  const first = starter.exercises[0];

  if (!first) {
    throw Error("seed");
  }

  const remove = (tx: Transaction<Schema>, exerciseId = first.id) =>
    mutators.workouts.deleteExercise.fn({
      tx,
      ctx,
      args: { householdId, exerciseId, optimisticTimestamp: 1234 },
    });
  const move = (
    tx: Transaction<Schema>,
    exerciseId: string,
    orderedExerciseIds: string[],
  ) =>
    mutators.workouts.reorderExercises.fn({
      tx,
      ctx,
      args: {
        householdId,
        exerciseId,
        orderedExerciseIds,
        optimisticTimestamp: 1234,
      },
    });
  it.each(["client", "server"] as const)(
    "soft-deletes all current links but preserves history and media: %s",
    async (location) => {
      const { tx, data, record } = setup(location);
      await record({ sets: [recordedSet] });

      const foreignSlot = {
        ...data.workoutExercises?.[0],
        id: crypto.randomUUID(),
        householdId: other,
      };
      data.workoutExercises?.push(
        { ...data.workoutExercises[0], workoutId: crypto.randomUUID() },
        foreignSlot,
      );
      data.exerciseMedia?.push({
        id: crypto.randomUUID(),
        householdId,
        exerciseId: first.id,
        deletedAt: null,
      });

      const logs = structuredClone(data.workoutLogs);
      const sets = structuredClone(data.workoutLogSets);
      const mediaBefore = structuredClone(data.exerciseMedia);
      await remove(tx);
      expect(data.exercises?.find((e) => e.id === first.id)?.deletedAt).toBe(
        location === "server" ? now : 1234,
      );
      expect(
        data.workoutExercises?.filter(
          (slot) =>
            slot.householdId === householdId && slot.exerciseId === first.id,
        ),
      ).toHaveLength(0);
      expect(data.workoutExercises).toContainEqual(foreignSlot);
      expect(data.workoutLogs).toEqual(logs);
      expect(data.workoutLogSets).toEqual(sets);
      expect(data.exerciseMedia).toEqual(mediaBefore);

      const catalog = await tx.run(
        queries.workouts.catalog.fn({ ctx, args: { householdId } }),
      );
      expect(catalog.some((e) => e.id === first.id)).toBe(false);
    },
  );
  it("deletion is idempotent and cannot be undone by stale edits or slot additions", async () => {
    const { tx, writes } = setup();
    await remove(tx);
    writes.mockClear();
    await remove(tx);
    expect(writes).not.toHaveBeenCalled();
    await expect(
      mutators.workouts.updateExercise.fn({
        tx,
        ctx,
        args: {
          householdId,
          exerciseId: first.id,
          changes: { name: "Stale" },
          optimisticTimestamp: 1234,
        },
      }),
    ).rejects.toThrow();
    await expect(
      mutators.workouts.editExercises.fn({
        tx,
        ctx,
        args: {
          ...scope,
          creates: [
            { ...first, id: crypto.randomUUID(), catalogExerciseId: first.id },
          ],
          updates: [],
          deletes: [],
        },
      }),
    ).rejects.toThrow("no longer available");
  });
  it("preserves correction of old logs, but rejects new logs using a deleted exercise", async () => {
    const state = setup();
    await state.record({ sets: [recordedSet] });
    await remove(state.tx);
    await expect(
      state.record({ sets: [recordedSet] }),
    ).resolves.toBeUndefined();

    const fresh = setup();
    await remove(fresh.tx);
    await expect(fresh.record({ sets: [recordedSet] })).rejects.toThrow(
      "Workout exercise not allowed",
    );
  });
  it.each(["membership", "module", "household"] as const)(
    "protects delete and order with %s authorization",
    async (reason) => {
      const { tx, data, writes } = setup();

      if (reason === "membership") {
        data.householdMembers = [];
      }

      if (reason === "module") {
        data.householdModuleSettings = [];
      }

      if (reason === "household" && data.households?.[0]) {
        data.households[0].deletedAt = now;
      }

      await expect(remove(tx)).rejects.toThrow();
      await expect(move(tx, first.id, [first.id])).rejects.toThrow();
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("persists shared order and preserves omitted/unseen exercises", async () => {
    const { tx, data } = setup();
    const ids = data.exercises?.map((row) => String(row.id)) ?? [];
    const second = ids[1];

    if (!second) {
      throw Error("seed");
    }

    const unseen = structuredClone(data.exercises?.slice(2));
    await move(tx, second, [second, first.id]);
    expect(data.exercises?.slice(2)).toEqual(unseen);

    const ordered = await tx.run(
      queries.workouts.catalog.fn({ ctx, args: { householdId } }),
    );
    expect(ordered.slice(0, 2).map((row) => row.id)).toEqual([
      second,
      first.id,
    ]);
    expect(new Set(ordered.map((row) => row.id))).toEqual(new Set(ids));
  });
  it("rebalances all active rows without resurrecting tombstones", async () => {
    const { tx, data } = setup();
    const rows = data.exercises ?? [];

    if (!rows[0] || !rows[1] || !rows[2]) {
      throw Error("seed");
    }

    rows[0].sortKey = 3;
    rows[1].sortKey = 0;
    rows[2].sortKey = 2;

    const deleted = {
      ...rows[0],
      id: crypto.randomUUID(),
      deletedAt: now,
      sortKey: 999,
    };
    rows.push(deleted);

    const before = rows.length;
    await move(tx, String(rows[1].id), [
      String(rows[0].id),
      String(rows[1].id),
      String(rows[2].id),
    ]);
    expect(rows).toHaveLength(before);
    expect(deleted.sortKey).toBe(999);
    expect(deleted.deletedAt).toBe(now);

    const active = rows.filter((row) => row.deletedAt == null);
    expect(new Set(active.map((row) => row.sortKey)).size).toBe(active.length);
  });
  it.each(["deleted", "foreign", "missing"] as const)(
    "rejects ordering unavailable IDs: %s",
    async (kind) => {
      const { tx, data, writes } = setup();
      const target = crypto.randomUUID();

      if (kind !== "missing") {
        data.exercises?.push({
          ...data.exercises[0],
          id: target,
          householdId: kind === "foreign" ? other : householdId,
          deletedAt: kind === "deleted" ? now : null,
        });
      }

      await expect(move(tx, target, [target, first.id])).rejects.toThrow(
        "Reorder not allowed",
      );
      expect(writes).not.toHaveBeenCalled();
    },
  );
});

describe("shared exercise catalog", () => {
  const first = starter.exercises[0];

  if (!first) {
    throw new Error("seed");
  }

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

    if (!row) {
      throw new Error("catalog");
    }

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

    const logs = structuredClone(data.workoutLogs);
    const sets = structuredClone(data.workoutLogSets);
    await edit(tx, { deletes: [first.id] });
    expect(data.exercises?.some((e) => e.id === first.id)).toBe(true);
    expect(data.workoutLogs).toEqual(logs);
    expect(data.workoutLogSets).toEqual(sets);
  });
  it("keeps historical-only tombstones hidden when a new movement uses the same name", async () => {
    const { tx, data } = setup();
    data.exercises?.push({
      ...data.exercises[0],
      id: other,
      name: "Private historical movement",
      normalizedName: "private historical movement",
      deletedAt: now,
    });

    const before = await tx.run(
      queries.workouts.catalog.fn({ ctx, args: { householdId } }),
    );
    expect(before.some((e) => e.id === other)).toBe(false);

    const catalogExerciseId = crypto.randomUUID();
    await edit(tx, {
      creates: [
        {
          ...first,
          id: crypto.randomUUID(),
          catalogExerciseId,
          name: "Private historical movement",
          unit: "seconds",
        },
      ],
    });
    expect(data.exercises?.find((e) => e.id === other)).toMatchObject({
      deletedAt: now,
    });
    expect(
      data.exercises?.find((e) => e.id === catalogExerciseId),
    ).toMatchObject({ deletedAt: null, unit: "seconds" });
  });
  it.each(["module", "membership", "household"])(
    "blocks catalog reads and edits without %s access",
    async (reason) => {
      const { tx, data, writes } = setup();

      if (reason === "module") {
        data.householdModuleSettings = [];
      }

      if (reason === "membership") {
        data.householdMembers = [];
      }

      if (reason === "household" && data.households?.[0]) {
        data.households[0].deletedAt = now;
      }

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

describe("workout placement roles", () => {
  it("changes only the selected placement, not the movement or another workout", async () => {
    const { tx, data } = setup();
    const first = fixtureRow(data.workoutExercises);
    data.workouts?.push({ ...data.workouts[0], id: other });
    data.workoutExercises?.push({
      ...first,
      id: other,
      workoutId: other,
      role: "stretching",
    });

    const catalog = structuredClone(data.exercises);
    await mutators.workouts.editExercises.fn({
      tx,
      ctx,
      args: {
        ...scope,
        creates: [],
        deletes: [],
        updates: [
          { exerciseId: String(first.id), changes: { role: "warmup" } },
        ],
      },
    });
    expect(data.workoutExercises?.[0]?.role).toBe("warmup");
    expect(data.workoutExercises?.find((row) => row.id === other)?.role).toBe(
      "stretching",
    );
    expect(data.exercises).toEqual(catalog);
    await mutators.workouts.editExercises.fn({
      tx,
      ctx,
      args: {
        ...scope,
        creates: [],
        deletes: [],
        updates: [{ exerciseId: String(first.id), changes: { sets: 4 } }],
      },
    });
    expect(data.workoutExercises?.[0]?.role).toBe("warmup");
  });
});

describe("log-only exercises", () => {
  const catalog = {
    id: crypto.randomUUID(),
    name: "Extra curl",
    unit: "reps" as const,
    load: "single" as const,
    unilateral: false,
  };
  const extra = logOnlyWorkoutExercise(catalog);
  const payload = (): SaveExerciseSet => ({
    ...scope,
    optimisticTimestamp: now,
    logId,
    snapshot,
    completedOn: "2026-10-26",
    timeZone: "Europe/Brussels",
    workoutExerciseId: extra.id,
    exerciseLogId: crypto.randomUUID(),
    logOnlyExercise: extra,
    round: 1,
    values: { amount: 12, weightKg: 8, rightAmount: null },
  });
  const fixture = (location: "server" | "client" = "server") => {
    const state = setup(location);
    state.data.exercises?.push({
      ...catalog,
      householdId,
      normalizedName: normalizeExerciseName(catalog.name),
      deletedAt: null,
      sortKey: 0,
      createdAt: now,
      updatedAt: now,
    });

    return state;
  };

  it.each(["server", "client"] as const)(
    "saves an independent occurrence without changing the template, catalog or archive (%s)",
    async (location) => {
      const { tx, data, writes } = fixture(location);
      const before = structuredClone({
        workouts: data.workouts,
        slots: data.workoutExercises,
        catalog: data.exercises,
        archive: data.workoutLogSets,
      });
      const args = payload();
      await mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: {
          ...args,
          logOnlyExercise: { ...extra, name: "Client-supplied name" },
        },
      });
      expect(data.workoutLogs).toHaveLength(1);
      expect(data.workoutLogExercises).toHaveLength(1);
      expect(data.exerciseLogs).toHaveLength(1);
      expect(data.exerciseLogSets).toHaveLength(1);
      expect(data.workoutLogExercises?.[0]).toMatchObject({
        workoutExerciseId: catalog.id,
        exerciseLogId: args.exerciseLogId,
        householdId,
        userId,
        position: snapshot.exercises.length,
      });
      expect(data.exerciseLogs?.[0]).toMatchObject({
        exerciseId: catalog.id,
        performedOn: args.completedOn,
        snapshot: {
          id: catalog.id,
          catalogExerciseId: catalog.id,
          name: catalog.name,
        },
      });
      expect(data.exerciseLogs?.[0]?.snapshot).not.toHaveProperty("role");
      expect(
        workoutLogSnapshotSchema.parse(data.workoutLogs?.[0]?.snapshot)
          .exercises,
      ).toHaveLength(snapshot.exercises.length);
      expect({
        workouts: data.workouts,
        slots: data.workoutExercises,
        catalog: data.exercises,
        archive: data.workoutLogSets,
      }).toEqual(before);
      expect(
        writes.mock.calls.every(([table]) =>
          [
            "workoutLogs",
            "exerciseLogs",
            "exerciseLogSets",
            "workoutLogExercises",
          ].includes(String(table)),
        ),
      ).toBe(true);
    },
  );

  it("joins the canonical daily log, deduplicates later saves and preserves its snapshot and note", async () => {
    const { tx, data } = fixture();
    const args = payload();
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...args,
        workoutExerciseId: snapshot.exercises[0]?.id ?? "",
        exerciseLogId: crypto.randomUUID(),
        logOnlyExercise: undefined,
      },
    });
    const stored = fixtureRow(data.workoutLogs);
    stored.note = "Keep private note";
    const before = structuredClone(stored);
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: { ...args, logId: crypto.randomUUID() },
    });
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...args,
        logId: crypto.randomUUID(),
        exerciseLogId: crypto.randomUUID(),
        round: 2,
      },
    });
    expect(data.workoutLogs).toEqual([before]);
    expect(data.workoutLogExercises).toHaveLength(2);
    expect(data.exerciseLogs).toHaveLength(2);
    expect(data.exerciseLogSets).toHaveLength(3);
    expect(
      data.workoutLogExercises?.find(
        (row) => row.workoutExerciseId === catalog.id,
      )?.workoutLogId,
    ).toBe(logId);
  });

  it("freezes catalog settings and supports correcting/removing extra sets after catalog retirement", async () => {
    const { tx, data } = fixture();
    const args = payload();
    await mutators.workouts.saveSet.fn({ tx, ctx, args });
    const stored = structuredClone(data.exerciseLogs);
    const row = data.exercises?.find((row) => row.id === catalog.id);

    if (!row) {
      throw Error("fixture");
    }

    Object.assign(row, { name: "Changed", unit: "seconds", deletedAt: now });
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: { ...args, values: { ...args.values, amount: 15 } },
    });
    expect(data.exerciseLogs).toEqual(stored);
    expect(data.exerciseLogSets?.[0]).toMatchObject({
      amount: 15,
      unit: "reps",
    });
    await mutators.workouts.removeSet.fn({
      tx,
      ctx,
      args: {
        householdId,
        workoutId,
        logId,
        workoutExerciseId: catalog.id,
        round: 1,
      },
    });
    expect(data.exerciseLogSets).toEqual([]);
    expect(data.exerciseLogs).toEqual(stored);
  });

  it("corrects a persisted log-only occurrence after its retired catalog row leaves the client replica", async () => {
    const { tx, data } = fixture("client");
    const args = payload();
    await mutators.workouts.saveSet.fn({ tx, ctx, args });
    const frozen = structuredClone(data.exerciseLogs);
    data.exercises =
      data.exercises?.filter((row) => row.id !== catalog.id) ?? [];
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: { ...args, values: { ...args.values, amount: 11 } },
    });
    expect(data.exerciseLogs).toEqual(frozen);
    expect(data.exerciseLogSets?.[0]?.amount).toBe(11);
  });

  it.each([
    "deleted",
    "foreign",
    "missing",
    "settings",
    "identity",
    "incomplete",
    "member",
    "module",
    "foreign-log",
    "stolen-occurrence",
    "limit",
  ] as const)("rejects %s before writing", async (kind) => {
    const { tx, data, writes } = fixture();
    const args = payload();
    const row = data.exercises?.find((row) => row.id === catalog.id);

    if (!row) {
      throw Error("fixture");
    }

    if (kind === "deleted") {
      row.deletedAt = now;
    }
    if (kind === "foreign") {
      row.householdId = other;
    }
    if (kind === "missing") {
      data.exercises =
        data.exercises?.filter((row) => row.id !== catalog.id) ?? [];
    }
    if (kind === "settings") {
      row.unit = "seconds";
    }
    if (kind === "identity") {
      args.logOnlyExercise = { ...extra, id: crypto.randomUUID() };
    }
    if (kind === "incomplete") {
      args.values = { ...args.values, weightKg: null };
    }
    if (kind === "member") {
      data.householdMembers = [];
    }
    if (kind === "module") {
      fixtureRow(data.householdModuleSettings).enabled = false;
    }
    if (kind === "foreign-log") {
      data.workoutLogs?.push({
        id: logId,
        householdId,
        workoutId,
        userId: other,
      });
    }
    if (kind === "stolen-occurrence") {
      data.exerciseLogs?.push({
        id: args.exerciseLogId,
        householdId: other,
        userId: other,
        exerciseId: catalog.id,
      });
    }
    if (kind === "limit") {
      args.snapshot = {
        ...snapshot,
        exercises: Array.from({ length: 40 }, () => ({
          ...extra,
          id: crypto.randomUUID(),
          catalogExerciseId: crypto.randomUUID(),
        })),
      };
    }

    await expect(
      mutators.workouts.saveSet.fn({ tx, ctx, args }),
    ).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  });

  it("rejects adding an exercise already in the current workout, even if omitted from the submitted snapshot", async () => {
    const { tx, data, writes } = fixture();
    data.workoutExercises?.push({
      ...fixtureRow(data.workoutExercises),
      id: crypto.randomUUID(),
      exerciseId: catalog.id,
    });
    await expect(
      mutators.workouts.saveSet.fn({ tx, ctx, args: payload() }),
    ).rejects.toThrow("already belongs");
    expect(writes).not.toHaveBeenCalled();
  });
});

describe("exercise-first row logging", () => {
  const payload = {
    ...scope,
    optimisticTimestamp: now,
    logId,
    snapshot,
    completedOn: "2026-10-26",
    timeZone: "Europe/Brussels",
    workoutExerciseId: starter.exercises[0]?.id ?? "",
    exerciseLogId: "30000000-0000-4000-8000-000000000001",
    round: 1,
    values: { amount: 12, weightKg: 8, rightAmount: null },
  };
  it("captures roles separately for old-client compatibility and preserves historical corrections", async () => {
    const { tx, data } = setup();
    fixtureRow(data.workoutExercises).role = "warmup";
    await mutators.workouts.saveSet.fn({ tx, ctx, args: payload });

    const savedRole = () =>
      (fixtureRow(data.workoutLogs).exerciseRoles as Record<string, string>)[
        payload.workoutExerciseId
      ];
    expect(savedRole()).toBe("warmup");
    expect(
      workoutLogSnapshotSchema.parse(fixtureRow(data.workoutLogs).snapshot)
        .exercises[0],
    ).not.toHaveProperty("role");
    expect(fixtureRow(data.exerciseLogs).snapshot).not.toHaveProperty("role");
    fixtureRow(data.workoutExercises).role = "stretching";
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: { ...payload, values: { ...payload.values, amount: 14 } },
    });
    expect(savedRole()).toBe("warmup");
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...payload,
        logId: crypto.randomUUID(),
        exerciseLogId: crypto.randomUUID(),
        completedOn: "2026-10-27",
        optimisticTimestamp: now + 86400000,
      },
    });
    expect(
      (
        data.workoutLogs?.[1]?.exerciseRoles as
          | Record<string, string>
          | undefined
      )?.[payload.workoutExerciseId],
    ).toBe("stretching");
  });
  it("upserts individual rows without replacing other sets or touching the archive", async () => {
    const { tx, data } = setup();
    const save = (args: typeof payload) =>
      mutators.workouts.saveSet.fn({ tx, ctx, args });
    await save(payload);
    await save({ ...payload, round: 2, exerciseLogId: crypto.randomUUID() });
    await save({ ...payload, values: { ...payload.values, amount: 9 } });
    expect(data.workoutLogs).toHaveLength(1);
    expect(data.exerciseLogs).toHaveLength(1);
    expect(data.workoutLogExercises).toHaveLength(1);
    expect(data.exerciseLogSets).toHaveLength(2);
    expect(data.exerciseLogSets?.find((s) => s.round === 2)?.amount).toBe(12);
    expect(data.exerciseLogSets?.find((s) => s.round === 1)?.amount).toBe(9);
    expect(data.workoutLogSets).toEqual([]);
  });
  it("allows extra sets without changing the prescribed count", async () => {
    const { tx, data } = setup();
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: { ...payload, round: 3 },
    });
    expect(data.exerciseLogSets?.[0]?.round).toBe(3);
    expect(
      workoutLogSnapshotSchema.parse(fixtureRow(data.workoutLogs).snapshot)
        .exercises[0]?.sets,
    ).toBe(starter.exercises[0]?.sets);
  });
  it("rejects incomplete weighted/unilateral inputs before inserting anything", async () => {
    const { tx, data, writes } = setup();
    await expect(
      mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: { ...payload, values: { ...payload.values, weightKg: null } },
      }),
    ).rejects.toThrow("Complete");

    const unilateral = {
      ...snapshot,

      exercises: snapshot.exercises.map((e, i) =>
        i ? e : { ...e, unilateral: true },
      ),
    };
    await expect(
      mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: { ...payload, snapshot: unilateral },
      }),
    ).rejects.toThrow("Complete");
    expect(data.workoutLogs).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });
  it("keeps the original date, snapshot, note and measurements during corrections", async () => {
    const { tx, data } = setup();
    await mutators.workouts.saveSet.fn({ tx, ctx, args: payload });

    const original = structuredClone(data.exerciseLogs);
    fixtureRow(data.workoutLogs).note = "Keep note";
    fixtureRow(data.exercises).unit = "seconds";
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...payload,
        completedOn: "2026-10-27",
        optimisticTimestamp: now + 86400000,
        values: { ...payload.values, amount: 14 },
      },
    });
    expect(data.exerciseLogs).toEqual(original);
    expect(fixtureRow(data.workoutLogs).note).toBe("Keep note");
    expect(fixtureRow(data.exerciseLogSets).unit).toBe("reps");
    expect(fixtureRow(data.workoutLogs).completedOn).toBe("2026-10-26");
  });
  it("removes only the selected row, preserving other rows and the private note", async () => {
    const { tx, data } = setup();

    for (const round of [1, 2]) {
      await mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: { ...payload, round },
      });
    }

    fixtureRow(data.workoutLogs).note = "Keep";
    await mutators.workouts.removeSet.fn({
      tx,
      ctx,
      args: {
        householdId,
        workoutId,
        logId,
        workoutExerciseId: payload.workoutExerciseId,
        round: 1,
      },
    });
    expect(data.exerciseLogSets).toHaveLength(1);
    expect(fixtureRow(data.exerciseLogSets).round).toBe(2);
    expect(fixtureRow(data.workoutLogs).note).toBe("Keep");
  });
  it("rejects missing membership, disabled modules and foreign log IDs", async () => {
    const { tx, data } = setup();
    fixtureRow(data.householdModuleSettings).enabled = false;
    await expect(
      mutators.workouts.saveSet.fn({ tx, ctx, args: payload }),
    ).rejects.toThrow();
    fixtureRow(data.householdModuleSettings).enabled = true;
    data.workoutLogs?.push({
      id: logId,
      householdId,
      workoutId,
      userId: other,
    });
    await expect(
      mutators.workouts.saveSet.fn({ tx, ctx, args: payload }),
    ).rejects.toThrow("not allowed");
    expect(data.exerciseLogSets).toEqual([]);
  });
});

it("rejects a stale device's differing measurement convention before writing a canonical row", async () => {
  const { tx, data, record, writes } = setup();
  await record({ sets: [recordedSet] });
  writes.mockClear();

  const exercise = snapshot.exercises[0];

  if (!exercise) {
    throw Error("fixture");
  }

  await expect(
    mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...scope,
        logId,
        exerciseLogId: crypto.randomUUID(),
        workoutExerciseId: exercise.id,
        round: 1,
        snapshot: {
          title: snapshot.title,
          exercises: [{ ...exercise, unit: "seconds" }],
        },
        completedOn: String(data.workoutLogs?.[0]?.completedOn),
        optimisticTimestamp: Number(data.workoutLogs?.[0]?.completedAt),
        timeZone: "Europe/Brussels",
        values: { weightKg: 8, amount: 10, rightAmount: null },
      },
    }),
  ).rejects.toThrow("settings changed");
  expect(writes).not.toHaveBeenCalled();
});

describe("retired bulk workout logging", () => {
  it.each(["server", "client"] as const)(
    "rejects %s calls without reading or writing archived measurements",
    async (location) => {
      const { tx, writes } = setup(location);
      await expect(
        mutators.workouts.saveLog.fn({
          tx,
          ctx,
          args: {
            ...scope,
            logId,
            snapshot,
            sets: [],
            timeZone: "Europe/Brussels",
          },
        }),
      ).rejects.toThrow("Reload Home Hub");
      expect(writes).not.toHaveBeenCalled();
    },
  );
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
    await expect(
      mutators.workouts.saveLog.fn({
        tx,
        ctx,
        args: {
          ...scope,
          logId,
          snapshot,
          sets: [],
          timeZone: "Europe/Brussels",
        },
      }),
    ).rejects.toThrow("Reload Home Hub");
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

      if (!row) {
        throw new Error("log");
      }

      if (reason === "foreign user") {
        row.userId = other;
      }

      if (reason === "foreign household") {
        row.householdId = other;
      }

      if (reason === "foreign workout") {
        row.workoutId = other;
      }
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

      if (reason === "module") {
        data.householdModuleSettings = [];
      }

      if (reason === "membership") {
        data.householdMembers = [];
      }

      if (reason === "household" && data.households?.[0]) {
        data.households[0].deletedAt = now;
      }

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

      if (reason === "module") {
        data.householdModuleSettings = [];
      }

      if (reason === "membership") {
        data.householdMembers = [];
      }

      if (reason === "household" && data.households?.[0]) {
        data.households[0].deletedAt = now;
      }

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
