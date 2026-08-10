import type { createDbClient } from "@home-hub/database/client";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHouseholdInviteService } from "./create-invite";
import { hashInviteToken } from "./invite-token";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const now = new Date("2026-07-28T12:00:00Z");
const expiresAt = new Date("2026-08-04T12:00:00Z");

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
  const whereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const inserted: Array<{ table: unknown; values: unknown }> = [];

  const selectBuilder = {
    from: (table: unknown) => {
      fromTables.push(table);
      return selectBuilder;
    },
    where: (condition: unknown) => {
      whereClauses.push(condition);
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
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserted.push({ table, values });
      },
    }),
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    findUser,
    fromTables,
    inserted,
    limits,
    lockStrengths,
    selections,
    transaction,
    whereClauses,
  };
}

describe("create household invite service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized without checking ownership when the user is missing", async () => {
    const { db, inserted, selections, transaction } = createFakeDatabase({
      userExists: false,
    });
    const createInvite = createHouseholdInviteService({ db });

    await expect(createInvite({ userId, householdId })).resolves.toEqual({
      kind: "unauthorized",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("returns forbidden without inserting when the user is not the owner", async () => {
    const {
      db,
      fromTables,
      inserted,
      limits,
      lockStrengths,
      selections,
      whereClauses,
    } = createFakeDatabase({ ownerMembershipExists: false });
    const createInvite = createHouseholdInviteService({ db });

    await expect(createInvite({ userId, householdId })).resolves.toEqual({
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
    expect(limits).toEqual([1]);
    expect(lockStrengths).toEqual(["share"]);
    expect(inserted).toHaveLength(0);
  });

  it("creates a seven-day invite while persisting only its token hash", async () => {
    const { db, findUser, inserted, lockStrengths, transaction } =
      createFakeDatabase();
    const createInvite = createHouseholdInviteService({ db });

    const result = await createInvite({ userId, householdId });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("Expected invite creation to succeed");
    }

    expect(transaction).toHaveBeenCalledOnce();
    expect(findUser).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.any(Function),
    });
    expect(lockStrengths).toEqual(["share"]);
    expect(result.invite).toEqual({
      id: expect.any(String),
      householdId,
      createdAt: now,
      expiresAt,
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(inserted).toEqual([
      {
        table: householdInvites,
        values: {
          id: result.invite.id,
          householdId,
          creatorId: userId,
          tokenHash: hashInviteToken(result.invite.token),
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      },
    ]);

    const insertedValues = inserted[0]?.values as
      | { tokenHash?: string; token?: string }
      | undefined;
    expect(insertedValues?.tokenHash).not.toBe(result.invite.token);
    expect(insertedValues).not.toHaveProperty("token");
  });
});
