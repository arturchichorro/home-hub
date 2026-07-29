import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, shoppingItems } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createSetShoppingItemStatusService } from "./set-status";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";

type Database = ReturnType<typeof createDbClient>["db"];
type ShoppingItemStatus = typeof shoppingItems.$inferSelect.status;
type ReturnedItem = {
  id: string;
  householdId: string;
  name: string;
  status: ShoppingItemStatus;
};

function createItem(status: ShoppingItemStatus): ReturnedItem {
  return {
    id: itemId,
    householdId,
    name: "Whole Milk",
    status,
  };
}

function createFakeDatabase({
  userExists = true,
  membershipExists = true,
  item = createItem("active"),
  updatedItem = createItem("crossed"),
}: {
  userExists?: boolean;
  membershipExists?: boolean;
  item?: ReturnedItem | null;
  updatedItem?: ReturnedItem | null;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const membershipWhereClauses: unknown[] = [];
  const itemWhereClauses: unknown[] = [];
  const updateWhereClauses: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const updatedTables: unknown[] = [];
  const updatedValues: unknown[] = [];
  const returningSelections: unknown[] = [];

  const membershipBuilder = {
    from: (_table: unknown) => membershipBuilder,
    where: (condition: unknown) => {
      membershipWhereClauses.push(condition);
      return membershipBuilder;
    },
    limit: (_limit: unknown) => membershipBuilder,
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return membershipExists ? [{ id: "membership-id" }] : [];
    },
  };

  const itemBuilder = {
    from: (_table: unknown) => itemBuilder,
    where: (condition: unknown) => {
      itemWhereClauses.push(condition);
      return itemBuilder;
    },
    limit: (_limit: unknown) => itemBuilder,
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return item ? [item] : [];
    },
  };

  const select = vi.fn((selection: unknown) => {
    selections.push(selection);
    return selections.length === 1 ? membershipBuilder : itemBuilder;
  });

  const returning = vi.fn(async (selection: unknown) => {
    returningSelections.push(selection);
    return updatedItem ? [updatedItem] : [];
  });

  const updateWhere = vi.fn((condition: unknown) => {
    updateWhereClauses.push(condition);
    return { returning };
  });

  const set = vi.fn((values: unknown) => {
    updatedValues.push(values);
    return { where: updateWhere };
  });

  const update = vi.fn((table: unknown) => {
    updatedTables.push(table);
    return { set };
  });

  const tx = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    select,
    update,
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    findUser,
    itemWhereClauses,
    lockStrengths,
    membershipWhereClauses,
    returningSelections,
    selections,
    transaction,
    update,
    updatedTables,
    updatedValues,
    updateWhereClauses,
  };
}

describe("set shopping item status service", () => {
  it("returns unauthorized without checking membership when the user is missing", async () => {
    const { db, selections, transaction, update } = createFakeDatabase({
      userExists: false,
    });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "crossed",
      }),
    ).resolves.toEqual({ kind: "unauthorized" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns forbidden without looking up the item when the user is not a household member", async () => {
    const { db, lockStrengths, membershipWhereClauses, selections, update } =
      createFakeDatabase({ membershipExists: false });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "crossed",
      }),
    ).resolves.toEqual({ kind: "forbidden" });

    expect(selections).toEqual([{ id: householdMembers.id }]);
    expect(membershipWhereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    ]);
    expect(lockStrengths).toEqual(["share"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not found after a tenant-scoped, update-locked item lookup", async () => {
    const { db, itemWhereClauses, lockStrengths, selections, update } =
      createFakeDatabase({ item: null });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "crossed",
      }),
    ).resolves.toEqual({ kind: "not_found" });

    expect(selections[1]).toEqual({
      id: shoppingItems.id,
      householdId: shoppingItems.householdId,
      name: shoppingItems.name,
      status: shoppingItems.status,
    });
    expect(itemWhereClauses).toEqual([
      and(
        eq(shoppingItems.id, itemId),
        eq(shoppingItems.householdId, householdId),
      ),
    ]);
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the current item without writing when the status is unchanged", async () => {
    const item = createItem("active");
    const { db, update, updatedValues } = createFakeDatabase({ item });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "active",
      }),
    ).resolves.toEqual({ kind: "success", item });

    expect(update).not.toHaveBeenCalled();
    expect(updatedValues).toHaveLength(0);
  });

  it.each([
    ["active", "crossed"],
    ["active", "archived"],
    ["crossed", "active"],
    ["crossed", "archived"],
    ["archived", "active"],
    ["archived", "crossed"],
  ] as const)("changes status from %s to %s", async (currentStatus, status) => {
    const item = createItem(currentStatus);
    const updatedItem = createItem(status);
    const { db } = createFakeDatabase({ item, updatedItem });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status,
      }),
    ).resolves.toEqual({ kind: "success", item: updatedItem });
  });

  it("updates the tenant-scoped row and returns its authoritative database value", async () => {
    const updatedItem = createItem("archived");
    const {
      db,
      returningSelections,
      updatedTables,
      updatedValues,
      updateWhereClauses,
    } = createFakeDatabase({
      item: createItem("crossed"),
      updatedItem,
    });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "archived",
      }),
    ).resolves.toEqual({ kind: "success", item: updatedItem });

    expect(updatedTables).toEqual([shoppingItems]);
    expect(updatedValues).toEqual([
      {
        status: "archived",
        updatedAt: expect.any(Date),
      },
    ]);
    expect(updateWhereClauses).toEqual([
      and(
        eq(shoppingItems.id, itemId),
        eq(shoppingItems.householdId, householdId),
      ),
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

  it("throws when the database unexpectedly returns no updated row", async () => {
    const { db } = createFakeDatabase({ updatedItem: null });
    const setShoppingItemStatus = createSetShoppingItemStatusService({ db });

    await expect(
      setShoppingItemStatus({
        userId,
        householdId,
        itemId,
        status: "crossed",
      }),
    ).rejects.toThrow("Shopping item status update returned no row");
  });
});
