import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, households } from "@home-hub/database/schema";
import { asc, desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createListHouseholdsService, type HouseholdSummary } from "./list";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase({
  userExists = true,
  rows = [],
}: {
  userExists?: boolean;
  rows?: HouseholdSummary[];
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const fromTables: unknown[] = [];
  const joins: Array<{ table: unknown; condition: unknown }> = [];
  const whereClauses: unknown[] = [];
  const orderClauses: unknown[] = [];

  const builder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return builder;
    },
    innerJoin: (table: unknown, condition: unknown) => {
      joins.push({ table, condition });
      return builder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
      return builder;
    },
    orderBy: async (...conditions: unknown[]) => {
      orderClauses.push(...conditions);
      return rows;
    },
  };

  const select = vi.fn((selection: unknown) => {
    selections.push(selection);
    return builder;
  });

  const db = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    select,
  } as unknown as Database;

  return {
    db,
    findUser,
    fromTables,
    joins,
    orderClauses,
    select,
    selections,
    whereClauses,
  };
}

describe("list households service", () => {
  it("returns unauthorized without listing when the user no longer exists", async () => {
    const { db, select } = createFakeDatabase({ userExists: false });
    const listHouseholds = createListHouseholdsService({ db });

    await expect(listHouseholds(userId)).resolves.toEqual({
      kind: "unauthorized",
    });

    expect(select).not.toHaveBeenCalled();
  });

  it("returns an empty list for an existing user without memberships", async () => {
    const { db } = createFakeDatabase();
    const listHouseholds = createListHouseholdsService({ db });

    await expect(listHouseholds(userId)).resolves.toEqual({
      kind: "success",
      households: [],
    });
  });

  it("lists only the authenticated user's households with their roles", async () => {
    const rows: HouseholdSummary[] = [
      {
        id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
        name: "Home",
        role: "owner",
      },
      {
        id: "e6069a5f-b4f6-4b1e-bc0f-aa3bd34bd54d",
        name: "Family",
        role: "member",
      },
    ];
    const {
      db,
      findUser,
      fromTables,
      joins,
      orderClauses,
      selections,
      whereClauses,
    } = createFakeDatabase({ rows });
    const listHouseholds = createListHouseholdsService({ db });

    await expect(listHouseholds(userId)).resolves.toEqual({
      kind: "success",
      households: rows,
    });

    expect(findUser).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.any(Function),
    });
    expect(selections).toEqual([
      {
        id: households.id,
        name: households.name,
        role: householdMembers.role,
      },
    ]);
    expect(fromTables).toEqual([householdMembers]);
    expect(joins).toEqual([
      {
        table: households,
        condition: eq(householdMembers.householdId, households.id),
      },
    ]);
    expect(whereClauses).toEqual([eq(householdMembers.userId, userId)]);
    expect(orderClauses).toEqual([
      desc(households.createdAt),
      asc(households.id),
    ]);
  });
});
