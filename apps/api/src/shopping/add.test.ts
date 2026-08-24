import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  shoppingItems,
} from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createAddShoppingItemService } from "./add";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";

type ReturnedItem = {
  id: string;
  householdId: string;
  name: string;
  status: "active" | "crossed" | "archived";
};

function createFakeDatabase({
  userExists = true,
  membershipExists = true,
  moduleEnabled = true,
  returnedItem = {
    id: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
    householdId,
    name: "Whole Milk",
    status: "active",
  },
}: {
  userExists?: boolean;
  membershipExists?: boolean;
  moduleEnabled?: boolean;
  returnedItem?: ReturnedItem | null;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const fromTables: unknown[] = [];
  const whereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const insertedTables: unknown[] = [];
  const insertedValues: unknown[] = [];
  const conflictConfigs: unknown[] = [];
  const returningSelections: unknown[] = [];

  const membershipBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return membershipBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return membershipBuilder;
    },
    limit: (limit: unknown) => {
      limits.push(limit);
      return membershipBuilder;
    },
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return membershipExists ? [{ id: "membership-id" }] : [];
    },
  };

  const moduleSettingBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return moduleSettingBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return moduleSettingBuilder;
    },
    limit: (limit: unknown) => {
      limits.push(limit);
      return moduleSettingBuilder;
    },
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return moduleEnabled ? [{ householdId }] : [];
    },
  };

  const returning = vi.fn(async (selection: unknown) => {
    returningSelections.push(selection);
    return returnedItem ? [returnedItem] : [];
  });

  const onConflictDoUpdate = vi.fn((config: unknown) => {
    conflictConfigs.push(config);
    return { returning };
  });

  const values = vi.fn((value: unknown) => {
    insertedValues.push(value);
    return { onConflictDoUpdate };
  });

  const insert = vi.fn((table: unknown) => {
    insertedTables.push(table);
    return { values };
  });

  const select = vi.fn((selection: unknown) => {
    selections.push(selection);
    return selections.length === 1 ? membershipBuilder : moduleSettingBuilder;
  });

  const tx = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    select,
    insert,
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    conflictConfigs,
    findUser,
    fromTables,
    insertedTables,
    insertedValues,
    limits,
    lockStrengths,
    returningSelections,
    selections,
    transaction,
    whereClauses,
  };
}

describe("add shopping item service", () => {
  it("returns unauthorized without checking membership or writing when the user is missing", async () => {
    const { db, insertedTables, selections, transaction } = createFakeDatabase({
      userExists: false,
    });
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({ userId, householdId, name: "Milk" }),
    ).resolves.toEqual({ kind: "unauthorized" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
    expect(insertedTables).toHaveLength(0);
  });

  it("returns forbidden without writing when the user is not a household member", async () => {
    const {
      db,
      fromTables,
      insertedTables,
      limits,
      lockStrengths,
      selections,
      whereClauses,
    } = createFakeDatabase({ membershipExists: false });
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({ userId, householdId, name: "Milk" }),
    ).resolves.toEqual({ kind: "forbidden" });

    expect(selections).toEqual([{ id: householdMembers.id }]);
    expect(fromTables).toEqual([householdMembers]);
    expect(whereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    ]);
    expect(limits).toEqual([1]);
    expect(lockStrengths).toEqual(["share"]);
    expect(insertedTables).toHaveLength(0);
  });

  it("returns forbidden without writing when the shopping module is disabled", async () => {
    const {
      db,
      fromTables,
      insertedTables,
      lockStrengths,
      selections,
      whereClauses,
    } = createFakeDatabase({ moduleEnabled: false });
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({ userId, householdId, name: "Milk" }),
    ).resolves.toEqual({ kind: "forbidden" });

    expect(selections).toEqual([
      { id: householdMembers.id },
      { householdId: householdModuleSettings.householdId },
    ]);
    expect(fromTables).toEqual([householdMembers, householdModuleSettings]);
    expect(whereClauses[1]).toEqual(
      and(
        eq(householdModuleSettings.householdId, householdId),
        eq(householdModuleSettings.moduleKey, "shopping"),
        eq(householdModuleSettings.enabled, true),
      ),
    );
    expect(lockStrengths).toEqual(["share", "share"]);
    expect(insertedTables).toHaveLength(0);
  });

  it("cleans and normalizes the name and atomically inserts or reactivates the item", async () => {
    const {
      conflictConfigs,
      db,
      findUser,
      insertedTables,
      insertedValues,
      lockStrengths,
      returningSelections,
      transaction,
    } = createFakeDatabase();
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({
        userId,
        householdId,
        name: "  Ｗｈｏｌｅ   Milk  ",
      }),
    ).resolves.toEqual({
      kind: "success",
      item: {
        id: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
        householdId,
        name: "Whole Milk",
        status: "active",
      },
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(findUser).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.any(Function),
    });
    expect(lockStrengths).toEqual(["share", "share"]);
    expect(insertedTables).toEqual([shoppingItems]);
    expect(insertedValues).toEqual([
      {
        id: expect.any(String),
        householdId,
        name: "Whole Milk",
        normalizedName: "whole milk",
        status: "active",
        sortKey: expect.anything(),
      },
    ]);
    expect(conflictConfigs).toEqual([
      {
        target: [shoppingItems.householdId, shoppingItems.normalizedName],
        set: {
          status: "active",
          updatedAt: expect.any(Date),
        },
      },
    ]);
    expect(returningSelections).toEqual([
      {
        id: shoppingItems.id,
        householdId: shoppingItems.householdId,
        name: shoppingItems.name,
        status: shoppingItems.status,
      },
    ]);
  });

  it("returns the existing canonical row without replacing its display name on conflict", async () => {
    const existingItem = {
      id: "9c090146-f84a-4d11-9ca3-629ac70ffc15",
      householdId,
      name: "BBQ Sauce",
      status: "active" as const,
    };
    const { conflictConfigs, db } = createFakeDatabase({
      returnedItem: existingItem,
    });
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({ userId, householdId, name: "bbq sauce" }),
    ).resolves.toEqual({ kind: "success", item: existingItem });

    expect(conflictConfigs).toEqual([
      {
        target: [shoppingItems.householdId, shoppingItems.normalizedName],
        set: {
          status: "active",
          updatedAt: expect.any(Date),
        },
      },
    ]);
    expect(conflictConfigs[0]).not.toHaveProperty("set.name");
  });

  it("throws when the database unexpectedly returns no upserted row", async () => {
    const { db } = createFakeDatabase({ returnedItem: null });
    const addShoppingItem = createAddShoppingItemService({ db });

    await expect(
      addShoppingItem({ userId, householdId, name: "Milk" }),
    ).rejects.toThrow("Shopping item upsert returned no row");
  });
});
