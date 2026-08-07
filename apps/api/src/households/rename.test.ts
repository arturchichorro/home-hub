import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, households } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRenameHouseholdService } from "./rename";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const now = new Date("2026-08-07T12:00:00Z");

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase({
  userExists = true,
  ownerMembershipExists = true,
}: {
  userExists?: boolean;
  ownerMembershipExists?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const fromTables: unknown[] = [];
  const selectionWhereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const updatedTables: unknown[] = [];
  const updatedValues: unknown[] = [];
  const updateWhereClauses: unknown[] = [];
  const returningSelections: unknown[] = [];

  const selectBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return selectBuilder;
    },
    where: (condition: unknown) => {
      selectionWhereClauses.push(condition);
      return selectBuilder;
    },
    limit: (limit: unknown) => {
      limits.push(limit);
      return selectBuilder;
    },
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return ownerMembershipExists ? [{ id: "membership-id" }] : [];
    },
  };

  const updateBuilder = {
    set: (values: unknown) => {
      updatedValues.push(values);
      return updateBuilder;
    },
    where: (condition: unknown) => {
      updateWhereClauses.push(condition);
      return updateBuilder;
    },
    returning: async (selection: unknown) => {
      returningSelections.push(selection);
      return [{ id: householdId, name: "Renamed Home" }];
    },
  };

  const tx = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    select: (selection: unknown) => {
      selections.push(selection);
      return selectBuilder;
    },
    update: (table: unknown) => {
      updatedTables.push(table);
      return updateBuilder;
    },
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    findUser,
    fromTables,
    limits,
    lockStrengths,
    returningSelections,
    selections,
    selectionWhereClauses,
    transaction,
    updatedTables,
    updatedValues,
    updateWhereClauses,
  };
}

describe("rename household service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized without checking ownership when the user is missing", async () => {
    const { db, selections, transaction, updatedTables } = createFakeDatabase({
      userExists: false,
    });
    const renameHousehold = createRenameHouseholdService({ db });

    await expect(
      renameHousehold({ userId, householdId, name: "Renamed Home" }),
    ).resolves.toEqual({ kind: "unauthorized" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
    expect(updatedTables).toHaveLength(0);
  });

  it("returns forbidden without updating when the user is not the owner", async () => {
    const {
      db,
      fromTables,
      limits,
      lockStrengths,
      selections,
      selectionWhereClauses,
      updatedTables,
    } = createFakeDatabase({ ownerMembershipExists: false });
    const renameHousehold = createRenameHouseholdService({ db });

    await expect(
      renameHousehold({ userId, householdId, name: "Renamed Home" }),
    ).resolves.toEqual({ kind: "forbidden" });

    expect(selections).toEqual([{ id: householdMembers.id }]);
    expect(fromTables).toEqual([householdMembers]);
    expect(selectionWhereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
    ]);
    expect(limits).toEqual([1]);
    expect(lockStrengths).toEqual(["share"]);
    expect(updatedTables).toHaveLength(0);
  });

  it("renames the household and updates its timestamp", async () => {
    const {
      db,
      findUser,
      lockStrengths,
      returningSelections,
      transaction,
      updatedTables,
      updatedValues,
      updateWhereClauses,
    } = createFakeDatabase();
    const renameHousehold = createRenameHouseholdService({ db });

    await expect(
      renameHousehold({ userId, householdId, name: "Renamed Home" }),
    ).resolves.toEqual({
      kind: "success",
      household: { id: householdId, name: "Renamed Home" },
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(findUser).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.any(Function),
    });
    expect(lockStrengths).toEqual(["share"]);
    expect(updatedTables).toEqual([households]);
    expect(updatedValues).toEqual([{ name: "Renamed Home", updatedAt: now }]);
    expect(updateWhereClauses).toEqual([eq(households.id, householdId)]);
    expect(returningSelections).toEqual([
      { id: households.id, name: households.name },
    ]);
  });
});
