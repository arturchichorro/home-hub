import type { createDbClient } from "@home-hub/database/client";
import { refreshTokens } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogoutService } from "./logout";
import { hashRefreshToken } from "./refresh-token";

const rawRefreshToken = "raw-refresh-token";
const now = new Date("2026-07-24T12:00:00Z");
const futureExpiry = new Date("2026-08-23T12:00:00Z");
const pastExpiry = new Date("2026-06-24T12:00:00Z");

type StoredToken = {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
};

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase(selectResults: Array<StoredToken | undefined>) {
  let selectIndex = 0;
  const selectWhereClauses: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const updates: Array<{ set: unknown; where: unknown }> = [];

  const createSelectBuilder = () => {
    const builder = {
      from: () => builder,
      where: (clause: unknown) => {
        selectWhereClauses.push(clause);
        return builder;
      },
      limit: () => builder,
      for: async (strength: unknown) => {
        lockStrengths.push(strength);
        const result = selectResults[selectIndex++];
        return result ? [result] : [];
      },
    };

    return builder;
  };

  const tx = {
    select: () => createSelectBuilder(),
    update: () => ({
      set: (value: unknown) => ({
        where: async (clause: unknown) => {
          updates.push({ set: value, where: clause });
        },
      }),
    }),
  };

  const db = {
    transaction: async <T>(fn: (transaction: typeof tx) => Promise<T>) =>
      fn(tx),
  } as unknown as Database;

  return {
    db,
    lockStrengths,
    selectCallCount: () => selectIndex,
    selectWhereClauses,
    updates,
  };
}

describe("logout service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is an idempotent no-op for an unknown token", async () => {
    const { db, lockStrengths, selectWhereClauses, updates } =
      createFakeDatabase([undefined]);
    const logout = createLogoutService({ db });

    await expect(logout(rawRefreshToken)).resolves.toBeUndefined();

    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
    ]);
    expect(lockStrengths).toEqual(["update"]);
    expect(updates).toHaveLength(0);
  });

  it.each([
    pastExpiry,
    now,
  ])("is an idempotent no-op for a token expiring at %s", async (expiresAt) => {
    const { db, updates } = createFakeDatabase([
      {
        id: "token-1",
        expiresAt,
        revokedAt: null,
        replacedById: null,
      },
    ]);
    const logout = createLogoutService({ db });

    await expect(logout(rawRefreshToken)).resolves.toBeUndefined();

    expect(updates).toHaveLength(0);
  });

  it("revokes an active token without inspecting another session", async () => {
    const storedToken = {
      id: "token-1",
      expiresAt: futureExpiry,
      revokedAt: null,
      replacedById: null,
    };
    const { db, lockStrengths, selectCallCount, selectWhereClauses, updates } =
      createFakeDatabase([storedToken]);
    const logout = createLogoutService({ db });

    await logout(rawRefreshToken);

    expect(selectCallCount()).toBe(1);
    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
    ]);
    expect(lockStrengths).toEqual(["update"]);
    expect(updates).toEqual([
      {
        set: {
          revokedAt: now,
          updatedAt: now,
        },
        where: eq(refreshTokens.id, storedToken.id),
      },
    ]);
  });

  it("walks a stale token chain and revokes only its active descendant", async () => {
    const storedToken = {
      id: "token-1",
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-23T12:00:00Z"),
      replacedById: "token-2",
    };
    const revokedDescendant = {
      id: "token-2",
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-23T12:05:00Z"),
      replacedById: "token-3",
    };
    const activeDescendant = {
      id: "token-3",
      expiresAt: futureExpiry,
      revokedAt: null,
      replacedById: null,
    };
    const { db, lockStrengths, selectCallCount, selectWhereClauses, updates } =
      createFakeDatabase([storedToken, revokedDescendant, activeDescendant]);
    const logout = createLogoutService({ db });

    await logout(rawRefreshToken);

    expect(selectCallCount()).toBe(3);
    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
      eq(refreshTokens.id, "token-2"),
      eq(refreshTokens.id, "token-3"),
    ]);
    expect(lockStrengths).toEqual(["update", "update", "update"]);
    expect(updates).toEqual([
      {
        set: {
          revokedAt: now,
          updatedAt: now,
        },
        where: eq(refreshTokens.id, "token-3"),
      },
    ]);
  });

  it("throws when a stale token points at a missing replacement", async () => {
    const storedToken = {
      id: "token-1",
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-23T12:00:00Z"),
      replacedById: "missing-token",
    };
    const { db, lockStrengths, updates } = createFakeDatabase([
      storedToken,
      undefined,
    ]);
    const logout = createLogoutService({ db });

    await expect(logout(rawRefreshToken)).rejects.toThrow(
      "Broken refresh-token chain",
    );
    expect(lockStrengths).toEqual(["update", "update"]);
    expect(updates).toHaveLength(0);
  });
});
