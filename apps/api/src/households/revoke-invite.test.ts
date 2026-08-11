import type { Database } from "@home-hub/database";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRevokeHouseholdInviteService } from "./revoke-invite";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const inviteId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
const now = new Date("2026-08-07T12:00:00.000Z");

function createFakeDatabase({
  userExists = true,
  ownerExists = true,
  inviteExists = true,
}: {
  userExists?: boolean;
  ownerExists?: boolean;
  inviteExists?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selectedTables: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const selectionWhereClauses: unknown[] = [];
  const updatedTables: unknown[] = [];
  const updatedValues: unknown[] = [];
  const updateWhereClauses: unknown[] = [];

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
      if (selectedTables.at(-1) === householdMembers) {
        return ownerExists ? [{ id: "membership-id" }] : [];
      }

      return inviteExists ? [{ id: inviteId }] : [];
    },
  };

  const updateBuilder = {
    set(values: unknown) {
      updatedValues.push(values);
      return updateBuilder;
    },
    async where(condition: unknown) {
      updateWhereClauses.push(condition);
      return [];
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
    findUser,
    lockStrengths,
    selectedTables,
    selectionWhereClauses,
    transaction,
    updatedTables,
    updatedValues,
    updateWhereClauses,
  };
}

describe("revoke household invite service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized before inspecting the household", async () => {
    const { db, selectedTables, updatedTables } = createFakeDatabase({
      userExists: false,
    });

    await expect(
      createRevokeHouseholdInviteService({ db })({
        userId,
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(selectedTables).toHaveLength(0);
    expect(updatedTables).toHaveLength(0);
  });

  it("returns forbidden when the user is not the owner", async () => {
    const { db, lockStrengths, selectedTables, updatedTables } =
      createFakeDatabase({ ownerExists: false });

    await expect(
      createRevokeHouseholdInviteService({ db })({
        userId,
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind: "forbidden" });
    expect(selectedTables).toEqual([householdMembers]);
    expect(lockStrengths).toEqual(["share"]);
    expect(updatedTables).toHaveLength(0);
  });

  it("returns the generic invalid result without updating an inactive invite", async () => {
    const {
      db,
      lockStrengths,
      selectedTables,
      selectionWhereClauses,
      updatedTables,
    } = createFakeDatabase({ inviteExists: false });

    await expect(
      createRevokeHouseholdInviteService({ db })({
        userId,
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind: "invalid_invite" });
    expect(selectedTables).toEqual([householdMembers, householdInvites]);
    expect(selectionWhereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
      and(
        eq(householdInvites.id, inviteId),
        eq(householdInvites.householdId, householdId),
        isNull(householdInvites.acceptedAt),
        isNull(householdInvites.revokedAt),
        gt(householdInvites.expiresAt, now),
      ),
    ]);
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(updatedTables).toHaveLength(0);
  });

  it("locks and revokes an active invite in one transaction", async () => {
    const {
      db,
      lockStrengths,
      selectedTables,
      transaction,
      updatedTables,
      updatedValues,
      updateWhereClauses,
    } = createFakeDatabase();

    await expect(
      createRevokeHouseholdInviteService({ db })({
        userId,
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(selectedTables).toEqual([householdMembers, householdInvites]);
    expect(lockStrengths).toEqual(["share", "update"]);
    expect(updatedTables).toEqual([householdInvites]);
    expect(updatedValues).toEqual([{ revokedAt: now, updatedAt: now }]);
    expect(updateWhereClauses).toEqual([eq(householdInvites.id, inviteId)]);
  });
});
