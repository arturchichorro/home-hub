import type { createDbClient } from "@home-hub/database/client";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createRemoveHouseholdMemberService } from "./remove-member";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase({
  userExists = true,
  callerExists = true,
  callerRole = "owner",
  targetExists = true,
  targetRole = "member",
}: {
  userExists?: boolean;
  callerExists?: boolean;
  callerRole?: "owner" | "member";
  targetExists?: boolean;
  targetRole?: "owner" | "member";
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

      if (lockStrengths.length === 1) {
        return callerExists
          ? [{ id: "caller-membership-id", role: callerRole }]
          : [];
      }

      return targetExists ? [{ id: membershipId, role: targetRole }] : [];
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
    findUser,
    lockStrengths,
    selectedTables,
    selectionWhereClauses,
    transaction,
  };
}

function removeMember(db: Database) {
  return createRemoveHouseholdMemberService({ db })({
    userId,
    householdId,
    membershipId,
  });
}

describe("remove household member service", () => {
  it("returns unauthorized before inspecting memberships when the user is missing", async () => {
    const { db, deletedTables, selectedTables, transaction } =
      createFakeDatabase({ userExists: false });

    await expect(removeMember(db)).resolves.toEqual({ kind: "unauthorized" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(selectedTables).toHaveLength(0);
    expect(deletedTables).toHaveLength(0);
  });

  it.each([
    ["missing", { callerExists: false }],
    ["non-owner", { callerRole: "member" as const }],
  ] as const)(
    "returns forbidden when the caller membership is %s",
    async (_description, options) => {
      const { db, deletedTables, lockStrengths, selectedTables } =
        createFakeDatabase(options);

      await expect(removeMember(db)).resolves.toEqual({ kind: "forbidden" });
      expect(selectedTables).toEqual([householdMembers]);
      expect(lockStrengths).toEqual(["share"]);
      expect(deletedTables).toHaveLength(0);
    },
  );

  it("returns invalid_member when no target exists in the household", async () => {
    const {
      db,
      deletedTables,
      lockStrengths,
      selectedTables,
      selectionWhereClauses,
    } = createFakeDatabase({ targetExists: false });

    await expect(removeMember(db)).resolves.toEqual({
      kind: "invalid_member",
    });
    expect(selectedTables).toEqual([householdMembers, householdMembers]);
    expect(selectionWhereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
      and(
        eq(householdMembers.id, membershipId),
        eq(householdMembers.householdId, householdId),
      ),
    ]);
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(deletedTables).toHaveLength(0);
  });

  it("does not allow the owner membership to be removed", async () => {
    const { db, deletedTables, lockStrengths } = createFakeDatabase({
      targetRole: "owner",
    });

    await expect(removeMember(db)).resolves.toEqual({ kind: "forbidden" });
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(deletedTables).toHaveLength(0);
  });

  it("deletes an ordinary member after locking both memberships", async () => {
    const {
      db,
      deletedTables,
      deleteWhereClauses,
      lockStrengths,
      transaction,
    } = createFakeDatabase();

    await expect(removeMember(db)).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(deletedTables).toEqual([householdMembers]);
    expect(deleteWhereClauses).toEqual([
      and(
        eq(householdMembers.id, membershipId),
        eq(householdMembers.householdId, householdId),
      ),
    ]);
  });
});
