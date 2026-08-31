import { defineMutatorsWithType, type Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listMutatorDefinitions } from "./list-mutators";
import { mutators as liveMutators } from "./mutators";
import type { Schema } from "./schema.gen";

const mutators = defineMutatorsWithType<Schema>()({
  lists: listMutatorDefinitions,
}).lists;
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const listId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const otherListId = "5944cb0d-931a-4723-b981-77eacb122314";
const foreignHouseholdId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const otherItemId = "b5b8a5ea-89cb-4c31-a93d-33049ab11c73";
const ctx = { userId: "9f8a6942-f721-499d-957d-7bb3ed1158db" };
const scope = { householdId, listId };
const times = { optimisticTimestamp: 1000, optimisticUpdatedAt: 1000 };
type Row = Record<string, unknown>;
type Table =
  | "householdMembers"
  | "householdModuleSettings"
  | "lists"
  | "listItems";
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture");
  return value;
}
type Condition =
  | { type: "and"; conditions: Condition[] }
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: unknown };
    };

function matches(row: Row, condition?: Condition): boolean {
  if (!condition) return true;
  if (condition.type === "and")
    return condition.conditions.every((entry) => matches(row, entry));
  if (condition.op !== "=")
    throw new Error(`Unsupported test operator ${condition.op}`);
  return row[condition.left.name] === condition.right.value;
}

// Evaluate the actual scoped queries, rather than returning queued rows that
// could accidentally make an unscoped lookup look authorized.
function setup(location: "server" | "client" = "server") {
  const data: Record<Table, Row[]> = {
    householdMembers: [{ householdId, userId: ctx.userId }],
    householdModuleSettings: [
      { householdId, moduleKey: "lists", enabled: true },
    ],
    lists: [
      {
        id: listId,
        householdId,
        name: "Shopping",
        normalizedName: "shopping",
        sortKey: 1024,
      },
    ],
    listItems: [],
  };
  const writes = vi.fn();
  const crud = (table: Table) => ({
    insert: async (row: Row) => {
      writes(table, "insert", row);
      data[table].push({ ...row });
    },
    update: async (patch: Row) => {
      writes(table, "update", patch);
      const row = data[table].find((entry) => entry.id === patch.id);
      if (row) Object.assign(row, patch);
    },
    delete: async ({ id }: Row) => {
      writes(table, "delete", { id });
      data[table] = data[table].filter((entry) => entry.id !== id);
    },
  });
  const tx = {
    location,
    mutate: { lists: crud("lists"), listItems: crud("listItems") },
    run: async (query: unknown) => {
      const { ast, format } = query as {
        ast: {
          table: Table;
          where?: Condition;
          orderBy?: [string, string][];
          limit?: number;
        };
        format: { singular: boolean };
      };
      let rows = data[ast.table].filter((row) => matches(row, ast.where));
      for (const [key, direction] of [...(ast.orderBy ?? [])].reverse()) {
        rows.sort((a, b) => {
          const av = a[key] as string | number;
          const bv = b[key] as string | number;
          return (
            (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1)
          );
        });
      }
      if (ast.limit !== undefined) rows = rows.slice(0, ast.limit);
      return format.singular ? rows[0] : rows;
    },
  } as unknown as Transaction<Schema>;
  return { tx, data, writes };
}

const item = (overrides: Row = {}): Row => ({
  id: itemId,
  householdId,
  listId,
  name: "Milk",
  normalizedName: "milk",
  status: "active",
  sortKey: 1024,
  createdAt: 500,
  updatedAt: 500,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("Lists mutators", () => {
  it("activates Lists and removes legacy Shopping writes", () => {
    expect(mutators.create.mutatorName).toBe("lists.create");
    expect(liveMutators.lists.create.mutatorName).toBe("lists.create");
    expect(liveMutators).not.toHaveProperty("shopping");
  });
  it.each(["client", "server"] as const)(
    "creates at the top with %s timestamps",
    async (location) => {
      vi.spyOn(Date, "now").mockReturnValue(9000);
      const { tx, data } = setup(location);
      await mutators.create.fn({
        tx,
        ctx,
        args: {
          householdId,
          listId: otherListId,
          name: "  To   Do ",
          optimisticTimestamp: 1000,
        },
      });
      expect(data.lists).toContainEqual({
        id: otherListId,
        householdId,
        name: "To Do",
        normalizedName: "to do",
        sortKey: 2048,
        createdAt: location === "server" ? 9000 : 1000,
        updatedAt: location === "server" ? 9000 : 1000,
      });
    },
  );
  it("rejects a normalized duplicate list name", async () => {
    const { tx, writes } = setup();
    await expect(
      mutators.create.fn({
        tx,
        ctx,
        args: {
          householdId,
          listId: otherListId,
          name: " SHOPPING ",
          optimisticTimestamp: 1000,
        },
      }),
    ).rejects.toThrow("List name already exists");
    expect(writes).not.toHaveBeenCalled();
  });
  it("allows the same list name in a different household", async () => {
    const { tx, data } = setup();
    data.lists = [
      {
        id: listId,
        householdId: foreignHouseholdId,
        name: "Shopping",
        normalizedName: "shopping",
        sortKey: 1024,
      },
    ];
    await mutators.create.fn({
      tx,
      ctx,
      args: {
        ...scope,
        listId: otherListId,
        name: "Shopping",
        optimisticTimestamp: 1000,
      },
    });
    expect(data.lists).toHaveLength(2);
  });
  it("renames a list and permits its unchanged normalized name", async () => {
    const { tx, data } = setup("client");
    await mutators.rename.fn({
      tx,
      ctx,
      args: { ...scope, name: "SHOPPING", optimisticUpdatedAt: 1000 },
    });
    expect(data.lists[0]).toMatchObject({
      name: "SHOPPING",
      normalizedName: "shopping",
      updatedAt: 1000,
    });
  });
  it("rejects renaming into another list's name", async () => {
    const { tx, data, writes } = setup();
    data.lists.push({
      id: otherListId,
      householdId,
      normalizedName: "travel",
    });
    await expect(
      mutators.rename.fn({
        tx,
        ctx,
        args: { ...scope, name: "Travel", optimisticUpdatedAt: 1000 },
      }),
    ).rejects.toThrow("List name already exists");
    expect(writes).not.toHaveBeenCalled();
  });
  it("deletes only the selected list and its children, including on the client", async () => {
    const { tx, data } = setup("client");
    data.lists.push({ id: otherListId, householdId });
    data.listItems = [item(), item({ id: otherItemId, listId: otherListId })];
    await mutators.delete.fn({ tx, ctx, args: scope });
    expect(data.lists).toEqual([{ id: otherListId, householdId }]);
    expect(data.listItems).toEqual([
      expect.objectContaining({ id: otherItemId }),
    ]);
  });
  it("reorders lists within a household", async () => {
    const { tx, data } = setup("client");
    data.lists.push({ id: otherListId, householdId, sortKey: 0 });
    await mutators.reorder.fn({
      tx,
      ctx,
      args: {
        ...scope,
        listId: otherListId,
        orderedListIds: [otherListId, listId],
        optimisticUpdatedAt: 1000,
      },
    });
    expect(data.lists[1]).toMatchObject({ sortKey: 2048, updatedAt: 1000 });
  });

  const operations = [
    {
      name: "create",
      run: (tx: Transaction<Schema>) =>
        mutators.create.fn({
          tx,
          ctx,
          args: { ...scope, name: "Travel", optimisticTimestamp: 1000 },
        }),
    },
    {
      name: "rename",
      run: (tx: Transaction<Schema>) =>
        mutators.rename.fn({
          tx,
          ctx,
          args: { ...scope, name: "Travel", optimisticUpdatedAt: 1000 },
        }),
    },
    {
      name: "delete",
      run: (tx: Transaction<Schema>) =>
        mutators.delete.fn({ tx, ctx, args: scope }),
    },
    {
      name: "reorder",
      run: (tx: Transaction<Schema>) =>
        mutators.reorder.fn({
          tx,
          ctx,
          args: {
            ...scope,
            orderedListIds: [listId],
            optimisticUpdatedAt: 1000,
          },
        }),
    },
    {
      name: "addItem",
      run: (tx: Transaction<Schema>) =>
        mutators.addItem.fn({
          tx,
          ctx,
          args: { ...scope, itemId, name: "Milk", optimisticTimestamp: 1000 },
        }),
    },
    {
      name: "renameItem",
      run: (tx: Transaction<Schema>) =>
        mutators.renameItem.fn({
          tx,
          ctx,
          args: { ...scope, itemId, name: "Oats", optimisticUpdatedAt: 1000 },
        }),
    },
    {
      name: "setItemStatus",
      run: (tx: Transaction<Schema>) =>
        mutators.setItemStatus.fn({
          tx,
          ctx,
          args: {
            ...scope,
            itemId,
            status: "crossed",
            optimisticUpdatedAt: 1000,
          },
        }),
    },
    {
      name: "reorderItems",
      run: (tx: Transaction<Schema>) =>
        mutators.reorderItems.fn({
          tx,
          ctx,
          args: {
            ...scope,
            itemId,
            status: "active",
            orderedItemIds: [itemId],
            optimisticUpdatedAt: 1000,
          },
        }),
    },
  ];
  describe.each(operations)("$name authorization", ({ run, name }) => {
    it.each(["nonmember", "disabled", "missing setting"])(
      "rejects %s without writing",
      async (failure) => {
        const { tx, data, writes } = setup();
        if (failure === "nonmember") data.householdMembers = [];
        else if (failure === "disabled")
          required(data.householdModuleSettings[0]).enabled = false;
        else data.householdModuleSettings = [];
        await expect(run(tx)).rejects.toThrow("not allowed");
        expect(writes).not.toHaveBeenCalled();
      },
    );
    if (name !== "create")
      it("rejects a parent list from another household", async () => {
        const { tx, data, writes } = setup();
        required(data.lists[0]).householdId = foreignHouseholdId;
        await expect(run(tx)).rejects.toThrow("not allowed");
        expect(writes).not.toHaveBeenCalled();
      });
  });
  it("creates an item without reactivating its namesake in another list", async () => {
    const { tx, data } = setup("client");
    data.listItems = [
      item({ id: otherItemId, listId: otherListId, status: "archived" }),
    ];
    await mutators.addItem.fn({
      tx,
      ctx,
      args: { ...scope, itemId, name: " Milk ", optimisticTimestamp: 1000 },
    });
    expect(data.listItems).toHaveLength(2);
    expect(required(data.listItems[0]).status).toBe("archived");
    expect(data.listItems[1]).toMatchObject({
      id: itemId,
      listId,
      normalizedName: "milk",
      createdAt: 1000,
    });
  });
  it.each(["active", "crossed", "archived"])(
    "reactivates an existing %s item with its identity and history",
    async (status) => {
      const { tx, data } = setup("client");
      data.listItems = [item({ status })];
      await mutators.addItem.fn({
        tx,
        ctx,
        args: {
          ...scope,
          itemId: otherItemId,
          name: "MILK",
          optimisticTimestamp: 1000,
        },
      });
      expect(data.listItems).toHaveLength(1);
      expect(data.listItems[0]).toMatchObject({
        id: itemId,
        status: "active",
        createdAt: 500,
        updatedAt: 1000,
      });
    },
  );
  it("renames items, checking duplicates only in the selected list", async () => {
    const { tx, data } = setup("client");
    data.listItems = [
      item(),
      item({ id: otherItemId, listId: otherListId, normalizedName: "oats" }),
    ];
    await mutators.renameItem.fn({
      tx,
      ctx,
      args: { ...scope, itemId, name: "Oats", optimisticUpdatedAt: 1000 },
    });
    expect(data.listItems[0]).toMatchObject({
      name: "Oats",
      normalizedName: "oats",
    });
    required(data.listItems[1]).listId = listId;
    required(data.listItems[1]).normalizedName = "rice";
    await expect(
      mutators.renameItem.fn({
        tx,
        ctx,
        args: { ...scope, itemId, name: "Rice", optimisticUpdatedAt: 1000 },
      }),
    ).rejects.toThrow("List item name already exists");
  });
  it.each(["active", "crossed", "archived"] as const)(
    "sets %s using authoritative server time",
    async (status) => {
      vi.spyOn(Date, "now").mockReturnValue(9000);
      const { tx, data } = setup();
      data.listItems = [item()];
      await mutators.setItemStatus.fn({
        tx,
        ctx,
        args: { ...scope, itemId, status, optimisticUpdatedAt: 1000 },
      });
      expect(data.listItems[0]).toMatchObject({ status, updatedAt: 9000 });
    },
  );
  it.each(["renameItem", "setItemStatus", "reorderItems"])(
    "%s rejects items from another list",
    async (name) => {
      const { tx, data, writes } = setup();
      data.listItems = [item({ listId: otherListId })];
      await expect(
        required(operations.find((operation) => operation.name === name)).run(
          tx,
        ),
      ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("reorders items only within the selected status", async () => {
    const { tx, data } = setup("client");
    data.listItems = [item(), item({ id: otherItemId, sortKey: 2048 })];
    const args = {
      ...scope,
      itemId,
      status: "active" as const,
      orderedItemIds: [itemId, otherItemId],
      optimisticUpdatedAt: times.optimisticUpdatedAt,
    };
    await mutators.reorderItems.fn({ tx, ctx, args });
    expect(required(data.listItems[0]).sortKey).toBe(3072);
    required(data.listItems[1]).status = "crossed";
    await expect(mutators.reorderItems.fn({ tx, ctx, args })).rejects.toThrow(
      "not allowed",
    );
  });
});
