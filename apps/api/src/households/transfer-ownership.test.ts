import type { createDbClient } from "@home-hub/database/client";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTransferHouseholdOwnershipService } from "./transfer-ownership";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const ownerMembershipId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
const targetMembershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";
const now = new Date("2026-08-09T12:00:00.000Z");

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase({
  userExists = true,
  callerRole = "owner",
  targetRole = "member",
  updateResults = [[{ id: ownerMembershipId }], [{ id: targetMembershipId }]],
}: {
  userExists?: boolean;
  callerRole?: "owner" | "member" | null;
  targetRole?: "owner" | "member" | null;
  updateResults?: Array<Array<{ id: string }>>;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selectionWhereClauses: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const updatedTables: unknown[] = [];
  const updatedValues: unknown[] = [];
  const updateWhereClauses: unknown[] = [];
  let selectionNumber = 0;
  let updateNumber = 0;

  const selectBuilder = {
    from() {
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
      selectionNumber += 1;
      const role = selectionNumber === 1 ? callerRole : targetRole;
      const id = selectionNumber === 1 ? ownerMembershipId : targetMembershipId;
      return role ? [{ id, role }] : [];
    },
  };

  const updateBuilder = {
    set(values: unknown) {
      updatedValues.push(values);
      return updateBuilder;
    },
    where(condition: unknown) {
      updateWhereClauses.push(condition);
      return updateBuilder;
    },
    async returning() {
      const result = updateResults[updateNumber] ?? [];
      updateNumber += 1;
      return result;
    },
  };

  const tx = {
    query: { users: { findFirst: findUser } },
    select: () => selectBuilder,
    update(table: unknown) {
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
    lockStrengths,
    selectionWhereClauses,
    transaction,
    updatedTables,
    updatedValues,
    updateWhereClauses,
  };
}

function transferOwnership(db: Database) {
  return createTransferHouseholdOwnershipService({ db })({
    userId,
    householdId,
    membershipId: targetMembershipId,
  });
}

describe("transfer household ownership service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized before reading memberships when the user is missing", async () => {
    const { db, lockStrengths, updatedTables } = createFakeDatabase({
      userExists: false,
    });

    await expect(transferOwnership(db)).resolves.toEqual({
      kind: "unauthorized",
    });
    expect(lockStrengths).toHaveLength(0);
    expect(updatedTables).toHaveLength(0);
  });

  it("returns forbidden when the caller is not the current owner", async () => {
    const { db, lockStrengths, updatedTables } = createFakeDatabase({
      callerRole: "member",
    });

    await expect(transferOwnership(db)).resolves.toEqual({ kind: "forbidden" });
    expect(lockStrengths).toEqual(["update"]);
    expect(updatedTables).toHaveLength(0);
  });

  it.each([null, "owner"] as const)(
    "rejects a target whose role is %s",
    async (targetRole) => {
      const { db, lockStrengths, selectionWhereClauses, updatedTables } =
        createFakeDatabase({ targetRole });

      await expect(transferOwnership(db)).resolves.toEqual({
        kind: "invalid_member",
      });
      expect(selectionWhereClauses[1]).toEqual(
        and(
          eq(householdMembers.id, targetMembershipId),
          eq(householdMembers.householdId, householdId),
        ),
      );
      expect(lockStrengths).toEqual(["update", "update"]);
      expect(updatedTables).toHaveLength(0);
    },
  );

  it("demotes the owner before promoting the locked target in one transaction", async () => {
    const {
      db,
      lockStrengths,
      transaction,
      updatedTables,
      updatedValues,
      updateWhereClauses,
    } = createFakeDatabase();

    await expect(transferOwnership(db)).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(lockStrengths).toEqual(["update", "update"]);
    expect(updatedTables).toEqual([householdMembers, householdMembers]);
    expect(updatedValues).toEqual([
      { role: "member", updatedAt: now },
      { role: "owner", updatedAt: now },
    ]);
    expect(updateWhereClauses).toEqual([
      and(
        eq(householdMembers.id, ownerMembershipId),
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.role, "owner"),
      ),
      and(
        eq(householdMembers.id, targetMembershipId),
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.role, "member"),
      ),
    ]);
  });

  it("throws so the transaction rolls back if promotion unexpectedly fails", async () => {
    const { db } = createFakeDatabase({
      updateResults: [[{ id: ownerMembershipId }], []],
    });

    await expect(transferOwnership(db)).rejects.toThrow(
      "Locked household member could not be promoted",
    );
  });
});
