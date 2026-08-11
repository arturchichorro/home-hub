import type { Database } from "@home-hub/database";
import { householdMembers, users } from "@home-hub/database/schema";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createListHouseholdMembersService } from "./list-members";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const joinedAt = new Date("2026-08-01T12:00:00Z");

const memberRows = [
  {
    id: "7dbb2304-955a-4d0b-9878-d39a42a38eb2",
    username: "artur",
    role: "owner" as const,
    joinedAt,
  },
  {
    id: "e467b00a-5f80-4c13-aa5b-d2e59996dd82",
    username: "alice",
    role: "member" as const,
    joinedAt: new Date("2026-08-02T12:00:00Z"),
  },
];

function createFakeDatabase({
  userExists = true,
  callerMembershipExists = true,
}: {
  userExists?: boolean;
  callerMembershipExists?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const fromTables: unknown[] = [];
  const whereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const joins: Array<{ table: unknown; condition: unknown }> = [];
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
      return callerMembershipExists ? [{ id: "caller-membership-id" }] : [];
    },
  };

  const rosterBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return rosterBuilder;
    },
    innerJoin: (table: unknown, condition: unknown) => {
      joins.push({ table, condition });
      return rosterBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return rosterBuilder;
    },
    orderBy: async (...ordering: unknown[]) => {
      orderings.push(ordering);
      return memberRows;
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
      return selections.length === 1 ? authorizationBuilder : rosterBuilder;
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
    joins,
    limits,
    lockStrengths,
    orderings,
    selections,
    transaction,
    whereClauses,
  };
}

describe("list household members service", () => {
  it("returns unauthorized without checking membership when the user is missing", async () => {
    const { db, selections, transaction } = createFakeDatabase({
      userExists: false,
    });
    const listMembers = createListHouseholdMembersService({ db });

    await expect(listMembers({ userId, householdId })).resolves.toEqual({
      kind: "unauthorized",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
  });

  it("returns forbidden without reading the roster when membership is missing", async () => {
    const { db, fromTables, lockStrengths, selections, whereClauses } =
      createFakeDatabase({ callerMembershipExists: false });
    const listMembers = createListHouseholdMembersService({ db });

    await expect(listMembers({ userId, householdId })).resolves.toEqual({
      kind: "forbidden",
    });

    expect(selections).toEqual([{ id: householdMembers.id }]);
    expect(fromTables).toEqual([householdMembers]);
    expect(whereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    ]);
    expect(lockStrengths).toEqual(["share"]);
  });

  it("returns only the safe roster fields in deterministic order", async () => {
    const {
      db,
      fromTables,
      joins,
      limits,
      lockStrengths,
      orderings,
      selections,
      whereClauses,
    } = createFakeDatabase();
    const listMembers = createListHouseholdMembersService({ db });

    await expect(listMembers({ userId, householdId })).resolves.toEqual({
      kind: "success",
      members: memberRows,
    });

    expect(selections).toEqual([
      { id: householdMembers.id },
      {
        id: householdMembers.id,
        username: users.username,
        role: householdMembers.role,
        joinedAt: householdMembers.createdAt,
      },
    ]);
    expect(fromTables).toEqual([householdMembers, householdMembers]);
    expect(joins).toEqual([
      {
        table: users,
        condition: eq(householdMembers.userId, users.id),
      },
    ]);
    expect(whereClauses).toEqual([
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
      eq(householdMembers.householdId, householdId),
    ]);
    expect(limits).toEqual([1]);
    expect(lockStrengths).toEqual(["share"]);
    expect(orderings).toEqual([
      [asc(householdMembers.createdAt), asc(householdMembers.id)],
    ]);
  });
});
