import type { Database } from "@home-hub/database";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createLeaveHouseholdService } from "./leave";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

function createFakeDatabase({
  userExists = true,
  membershipRole = "member",
}: {
  userExists?: boolean;
  membershipRole?: "owner" | "member" | null;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selectedTables: unknown[] = [];
  const selectionWhereClauses: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const deletedTables: unknown[] = [];
  const deleteWhereClauses: unknown[] = [];

  const selectBuilder = {
    from(table: unknown) {
      selectedTables.push(table);
      return selectBuilder;
    },
    where(condition: unknown) {
      selectionWhereClauses.push(condition);
      return selectBuilder;
    },
    limit() {
      return selectBuilder;
    },
    async for(strength: unknown) {
      lockStrengths.push(strength);
      return membershipRole ? [{ id: membershipId, role: membershipRole }] : [];
    },
  };

  const deleteBuilder = {
    async where(condition: unknown) {
      deleteWhereClauses.push(condition);
      return [];
    },
  };

  const tx = {
    query: { users: { findFirst: findUser } },
    select: () => selectBuilder,
    delete(table: unknown) {
      deletedTables.push(table);
      return deleteBuilder;
    },
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    deletedTables,
    deleteWhereClauses,
    lockStrengths,
    selectedTables,
    selectionWhereClauses,
    transaction,
  };
}

function leaveHousehold(db: Database) {
  return createLeaveHouseholdService({ db })({ userId, householdId });
}

describe("leave household service", () => {
  it("returns unauthorized before inspecting membership when the user is missing", async () => {
    const { db, deletedTables, selectedTables, transaction } =
      createFakeDatabase({ userExists: false });

    await expect(leaveHousehold(db)).resolves.toEqual({ kind: "unauthorized" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(selectedTables).toHaveLength(0);
    expect(deletedTables).toHaveLength(0);
  });

  it("returns forbidden when the user does not belong to the household", async () => {
    const { db, deletedTables, lockStrengths, selectionWhereClauses } =
      createFakeDatabase({ membershipRole: null });

    await expect(leaveHousehold(db)).resolves.toEqual({ kind: "forbidden" });
    expect(selectionWhereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    ]);
    expect(lockStrengths).toEqual(["update"]);
    expect(deletedTables).toHaveLength(0);
  });

  it("requires an owner to transfer ownership before leaving", async () => {
    const { db, deletedTables, lockStrengths } = createFakeDatabase({
      membershipRole: "owner",
    });

    await expect(leaveHousehold(db)).resolves.toEqual({
      kind: "owner_must_transfer",
    });
    expect(lockStrengths).toEqual(["update"]);
    expect(deletedTables).toHaveLength(0);
  });

  it("locks and deletes the authenticated member's scoped membership", async () => {
    const {
      db,
      deletedTables,
      deleteWhereClauses,
      lockStrengths,
      transaction,
    } = createFakeDatabase();

    await expect(leaveHousehold(db)).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(lockStrengths).toEqual(["update"]);
    expect(deletedTables).toEqual([householdMembers]);
    expect(deleteWhereClauses).toEqual([
      and(
        eq(householdMembers.id, membershipId),
        eq(householdMembers.householdId, householdId),
      ),
    ]);
  });
});
