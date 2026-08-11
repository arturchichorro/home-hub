import type { Database } from "@home-hub/database";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAcceptHouseholdInviteService } from "./accept-invite";
import { hashInviteToken } from "./invite-token";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const inviteId = "74fc10c9-a82d-4126-918c-0d09d1224a32";
const rawToken = "a".repeat(43);
const now = new Date("2026-07-28T12:00:00Z");

type StoredInvite = {
  id: string;
  householdId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

const activeInvite: StoredInvite = {
  id: inviteId,
  householdId,
  expiresAt: new Date("2026-08-04T12:00:00Z"),
  acceptedAt: null,
  revokedAt: null,
};

function createFakeDatabase({
  userExists = true,
  invite = activeInvite,
  existingMembership,
  failInviteUpdate = false,
}: {
  userExists?: boolean;
  invite?: StoredInvite | null;
  existingMembership?: { id: string };
  failInviteUpdate?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const selections: unknown[] = [];
  const fromTables: unknown[] = [];
  const whereClauses: unknown[] = [];
  const limits: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown; where: unknown }> =
    [];
  let selectIndex = 0;

  function createSelectBuilder(rows: unknown[]) {
    const builder = {
      from: (table: unknown) => {
        fromTables.push(table);
        return builder;
      },
      where: (condition: unknown) => {
        whereClauses.push(condition);
        return builder;
      },
      limit: (limit: unknown) => {
        limits.push(limit);
        return builder;
      },
      for: async (strength: unknown) => {
        lockStrengths.push(strength);
        return rows;
      },
      execute: async () => rows,
    };

    return builder;
  }

  const tx = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    select: (selection: unknown) => {
      selections.push(selection);
      const rows =
        selectIndex++ === 0
          ? invite
            ? [invite]
            : []
          : existingMembership
            ? [existingMembership]
            : [];
      return createSelectBuilder(rows);
    },
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserted.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (condition: unknown) => {
          updates.push({ table, values, where: condition });
          if (failInviteUpdate) {
            throw new Error("invite update failed");
          }
        },
      }),
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
    updates,
    whereClauses,
  };
}

describe("accept household invite service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns unauthorized without looking up an invite when the user is missing", async () => {
    const { db, selections, transaction } = createFakeDatabase({
      userExists: false,
    });
    const acceptInvite = createAcceptHouseholdInviteService({ db });

    await expect(acceptInvite({ userId, token: rawToken })).resolves.toEqual({
      kind: "unauthorized",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(selections).toHaveLength(0);
  });

  it.each([
    ["unknown", null],
    [
      "expired",
      { ...activeInvite, expiresAt: new Date("2026-07-28T11:59:59Z") },
    ],
    ["expiring now", { ...activeInvite, expiresAt: now }],
    ["accepted", { ...activeInvite, acceptedAt: now }],
    ["revoked", { ...activeInvite, revokedAt: now }],
  ] as const)("returns invalid_invite for an %s invite", async (_, invite) => {
    const { db, inserted, lockStrengths, updates } = createFakeDatabase({
      invite,
    });
    const acceptInvite = createAcceptHouseholdInviteService({ db });

    await expect(acceptInvite({ userId, token: rawToken })).resolves.toEqual({
      kind: "invalid_invite",
    });

    expect(lockStrengths).toEqual(["update"]);
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("leaves an active invite unused when the user is already a member", async () => {
    const { db, inserted, updates, whereClauses } = createFakeDatabase({
      existingMembership: { id: "existing-membership" },
    });
    const acceptInvite = createAcceptHouseholdInviteService({ db });

    await expect(acceptInvite({ userId, token: rawToken })).resolves.toEqual({
      kind: "already_member",
    });

    expect(whereClauses).toEqual([
      eq(householdInvites.tokenHash, hashInviteToken(rawToken)),
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    ]);
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("creates membership and consumes an active invite atomically", async () => {
    const { db, inserted, lockStrengths, transaction, updates } =
      createFakeDatabase();
    const acceptInvite = createAcceptHouseholdInviteService({ db });

    const result = await acceptInvite({ userId, token: rawToken });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("Expected invite acceptance to succeed");
    }

    expect(transaction).toHaveBeenCalledOnce();
    expect(lockStrengths).toEqual(["update"]);
    expect(inserted).toEqual([
      {
        table: householdMembers,
        values: {
          id: result.membership.id,
          householdId,
          userId,
          role: "member",
        },
      },
    ]);
    expect(updates).toEqual([
      {
        table: householdInvites,
        values: {
          acceptedAt: now,
          updatedAt: now,
        },
        where: eq(householdInvites.id, inviteId),
      },
    ]);
    expect(result.membership).toEqual({
      id: expect.any(String),
      householdId,
      role: "member",
    });
  });

  it("propagates invite-update failure so the transaction can roll back membership", async () => {
    const { db, inserted, updates } = createFakeDatabase({
      failInviteUpdate: true,
    });
    const acceptInvite = createAcceptHouseholdInviteService({ db });

    await expect(acceptInvite({ userId, token: rawToken })).rejects.toThrow(
      "invite update failed",
    );

    expect(inserted).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });
});
