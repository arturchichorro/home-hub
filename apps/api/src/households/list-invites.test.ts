import type { Database } from "@home-hub/database";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createListHouseholdInvitesService } from "./list-invites";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const now = new Date("2026-08-07T12:00:00Z");

const inviteRows = [
  {
    id: "7dbb2304-955a-4d0b-9878-d39a42a38eb2",
    createdAt: new Date("2026-08-06T12:00:00Z"),
    expiresAt: new Date("2026-08-13T12:00:00Z"),
  },
];

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
  const whereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const orderings: unknown[][] = [];

  const authorizationBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return authorizationBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return authorizationBuilder;
    },
    limit: (limit: unknown) => {
      limits.push(limit);
      return authorizationBuilder;
    },
    for: async (strength: unknown) => {
      lockStrengths.push(strength);
      return ownerMembershipExists ? [{ id: "owner-membership-id" }] : [];
    },
  };

  const invitesBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return invitesBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return invitesBuilder;
    },
    orderBy: async (...ordering: unknown[]) => {
      orderings.push(ordering);
      return inviteRows;
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
      return selections.length === 1 ? authorizationBuilder : invitesBuilder;
    },
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    fromTables,
    limits,
    lockStrengths,
    orderings,
    selections,
    transaction,
    whereClauses,
  };
}

describe("list household invites service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized without checking ownership when the user is missing", async () => {
    const { db, selections, transaction } = createFakeDatabase({
      userExists: false,
    });
    const listInvites = createListHouseholdInvitesService({ db });

    await expect(listInvites({ userId, householdId })).resolves.toEqual({
      kind: "unauthorized",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
  });

  it("returns forbidden without reading invites when the user is not the owner", async () => {
    const { db, fromTables, lockStrengths, selections, whereClauses } =
      createFakeDatabase({ ownerMembershipExists: false });
    const listInvites = createListHouseholdInvitesService({ db });

    await expect(listInvites({ userId, householdId })).resolves.toEqual({
      kind: "forbidden",
    });

    expect(selections).toEqual([{ id: householdMembers.id }]);
    expect(fromTables).toEqual([householdMembers]);
    expect(whereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
    ]);
    expect(lockStrengths).toEqual(["share"]);
  });

  it("returns only active invite metadata in deterministic order", async () => {
    const {
      db,
      fromTables,
      limits,
      lockStrengths,
      orderings,
      selections,
      whereClauses,
    } = createFakeDatabase();
    const listInvites = createListHouseholdInvitesService({ db });

    await expect(listInvites({ userId, householdId })).resolves.toEqual({
      kind: "success",
      invites: inviteRows,
    });

    expect(selections).toEqual([
      { id: householdMembers.id },
      {
        id: householdInvites.id,
        createdAt: householdInvites.createdAt,
        expiresAt: householdInvites.expiresAt,
      },
    ]);
    expect(fromTables).toEqual([householdMembers, householdInvites]);
    expect(whereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
      and(
        eq(householdInvites.householdId, householdId),
        isNull(householdInvites.acceptedAt),
        isNull(householdInvites.revokedAt),
        gt(householdInvites.expiresAt, now),
      ),
    ]);
    expect(limits).toEqual([1]);
    expect(lockStrengths).toEqual(["share"]);
    expect(orderings).toEqual([
      [asc(householdInvites.createdAt), asc(householdInvites.id)],
    ]);
  });
});
