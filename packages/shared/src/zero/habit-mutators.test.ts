import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mutators } from "./mutators";
import type { Schema } from "./schema.gen";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const habitId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const foreignId = "5944cb0d-931a-4723-b981-77eacb122314";
const ctx = { userId: "9f8a6942-f721-499d-957d-7bb3ed1158db" };
const now = Date.parse("2026-10-15T12:00:00Z");
const scope = { householdId, habitId, optimisticTimestamp: now };
const completeArgs = {
  ...scope,
  completedOn: "2026-10-14",
  completed: true,
  timeZone: "UTC",
};
type Row = Record<string, unknown>;
type Table =
  | "households"
  | "householdMembers"
  | "householdModuleSettings"
  | "habits"
  | "habitCompletions";
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
        subquery: { table: Table; where?: Condition };
      };
    };

function matches(
  row: Row,
  condition: Condition | undefined,
  data: Record<Table, Row[]>,
): boolean {
  if (!condition) return true;
  if (condition.type === "and")
    return condition.conditions.every((entry) => matches(row, entry, data));
  if (condition.type === "correlatedSubquery") {
    const { correlation, subquery } = condition.related;
    return data[subquery.table].some(
      (candidate) =>
        correlation.parentField.every(
          (field, index) =>
            row[field] === candidate[correlation.childField[index] ?? ""],
        ) && matches(candidate, subquery.where, data),
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
  const data: Record<Table, Row[]> = {
    households: [{ id: householdId, deletedAt: null }],
    householdMembers: [{ householdId, userId: ctx.userId }],
    householdModuleSettings: [
      { householdId, moduleKey: "habits", enabled: true },
    ],
    habits: [
      {
        id: habitId,
        householdId,
        name: "Exercise",
        createdOn: "2026-10-12",
        archivedAt: null,
      },
    ],
    habitCompletions: [],
  };
  const writes = vi.fn();
  const sameKey = (table: Table, row: Row, key: Row) =>
    table === "habitCompletions"
      ? row.habitId === key.habitId &&
        row.userId === key.userId &&
        row.completedOn === key.completedOn
      : row.id === key.id;
  const crud = (table: Table) => ({
    insert: async (row: Row) => {
      writes(table, "insert", row);
      if (!data[table].some((entry) => sameKey(table, entry, row)))
        data[table].push({ ...row });
    },
    update: async (row: Row) => {
      writes(table, "update", row);
      const existing = data[table].find((entry) => sameKey(table, entry, row));
      if (existing) Object.assign(existing, row);
    },
    delete: async (key: Row) => {
      writes(table, "delete", key);
      data[table] = data[table].filter((row) => !sameKey(table, row, key));
    },
  });
  const tx = {
    location,
    mutate: {
      habits: crud("habits"),
      habitCompletions: crud("habitCompletions"),
    },
    run: async (query: unknown) => {
      const { ast, format } = query as {
        ast: { table: Table; where?: Condition };
        format: { singular: boolean };
      };
      const rows = data[ast.table].filter((row) =>
        matches(row, ast.where, data),
      );
      return format.singular ? rows[0] : rows;
    },
  } as unknown as Transaction<Schema>;
  return { tx, data, writes };
}

afterEach(() => vi.restoreAllMocks());

describe("habit mutations", () => {
  it.each(["client", "server"] as const)(
    "creates optimistically with %s timestamps and a local creation date",
    async (location) => {
      const { tx, data } = setup(location);
      const optimisticTimestamp = Date.parse("2026-10-14T00:30:00Z");
      await mutators.habits.create.fn({
        tx,
        ctx,
        args: {
          ...scope,
          habitId: foreignId,
          name: "  Read  books ",
          timeZone: "America/New_York",
          optimisticTimestamp,
        },
      });
      const expectedTime = location === "server" ? now : optimisticTimestamp;
      expect(data.habits[1]).toMatchObject({
        id: foreignId,
        householdId,
        name: "Read books",
        createdOn: location === "server" ? "2026-10-15" : "2026-10-13",
        createdAt: expectedTime,
        updatedAt: expectedTime,
        archivedAt: null,
      });
    },
  );
  it.each([
    "missing membership",
    "foreign membership",
    "disabled module",
    "missing module",
    "deleted household",
  ])("rejects writes for %s", async (reason) => {
    const { tx, data, writes } = setup();
    if (reason === "missing membership") data.householdMembers = [];
    if (reason === "foreign membership")
      data.householdMembers = [{ householdId: foreignId, userId: ctx.userId }];
    if (reason === "disabled module")
      data.householdModuleSettings = [
        { householdId, moduleKey: "habits", enabled: false },
      ];
    if (reason === "missing module") data.householdModuleSettings = [];
    if (reason === "deleted household")
      data.households = [{ id: householdId, deletedAt: now }];
    await expect(
      mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs }),
    ).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["rename", "archive", "setCompleted"] as const)(
    "rejects a foreign habit in %s",
    async (action) => {
      const { tx, data, writes } = setup();
      data.habits = [
        { id: habitId, householdId: foreignId, createdOn: "2026-10-12" },
      ];
      const request = { tx, ctx, args: { ...completeArgs, name: "Read" } };
      if (action === "rename")
        await expect(
          mutators.habits.rename.fn({
            ...request,
            args: { ...scope, name: "Read" },
          }),
        ).rejects.toThrow("not allowed");
      if (action === "archive")
        await expect(
          mutators.habits.archive.fn({ ...request, args: scope }),
        ).rejects.toThrow("not allowed");
      if (action === "setCompleted")
        await expect(
          mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs }),
        ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("lets another household member rename and archive, idempotently", async () => {
    const { tx, data, writes } = setup();
    await mutators.habits.rename.fn({
      tx,
      ctx,
      args: { ...scope, name: " Read " },
    });
    expect(data.habits[0]?.name).toBe("Read");
    await mutators.habits.archive.fn({ tx, ctx, args: scope });
    await mutators.habits.archive.fn({ tx, ctx, args: scope });
    expect(data.habits[0]?.archivedAt).toBe(now);
    expect(writes).toHaveBeenCalledTimes(2);
    await expect(
      mutators.habits.rename.fn({ tx, ctx, args: { ...scope, name: "Run" } }),
    ).rejects.toThrow("not allowed");
    await expect(
      mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs }),
    ).rejects.toThrow("not allowed");
  });
  it("sets and clears own completion without touching another member", async () => {
    const { tx, data } = setup();
    data.habitCompletions.push({
      householdId,
      habitId,
      userId: foreignId,
      completedOn: completeArgs.completedOn,
    });
    await mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs });
    await mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs });
    expect(data.habitCompletions).toHaveLength(2);
    expect(data.habitCompletions).toContainEqual(
      expect.objectContaining({
        userId: ctx.userId,
        completedOn: completeArgs.completedOn,
      }),
    );
    await mutators.habits.setCompleted.fn({
      tx,
      ctx,
      args: { ...completeArgs, completed: false },
    });
    await mutators.habits.setCompleted.fn({
      tx,
      ctx,
      args: { ...completeArgs, completed: false },
    });
    expect(data.habitCompletions).toEqual([
      {
        householdId,
        habitId,
        userId: foreignId,
        completedOn: completeArgs.completedOn,
      },
    ]);
  });
  it("converges concurrent repeated set-completed requests on the natural key", async () => {
    const { tx, data } = setup();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        mutators.habits.setCompleted.fn({ tx, ctx, args: completeArgs }),
      ),
    );
    expect(data.habitCompletions).toHaveLength(1);
  });
  it.each([true, false])(
    "rejects future/pre-creation date changes (completed=%s)",
    async (completed) => {
      const { tx, writes } = setup();
      for (const completedOn of ["2026-10-11", "2026-10-16"]) {
        await expect(
          mutators.habits.setCompleted.fn({
            tx,
            ctx,
            args: { ...completeArgs, completed, completedOn },
          }),
        ).rejects.toThrow("not allowed");
      }
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("uses server time instead of trusting the optimistic timestamp", async () => {
    const { tx } = setup();
    await expect(
      mutators.habits.setCompleted.fn({
        tx,
        ctx,
        args: {
          ...completeArgs,
          completedOn: "2026-10-16",
          optimisticTimestamp: now + 86400000,
        },
      }),
    ).rejects.toThrow("not allowed");
  });
  it("allows corrections to previous weeks without a target or enrollment", async () => {
    const { tx, data } = setup();
    data.habits = [
      {
        id: habitId,
        householdId,
        name: "Read",
        createdOn: "2026-01-01",
        archivedAt: null,
      },
    ];
    await mutators.habits.setCompleted.fn({
      tx,
      ctx,
      args: { ...completeArgs, completedOn: "2026-02-01" },
    });
    expect(data.habitCompletions[0]?.completedOn).toBe("2026-02-01");
  });
});
