import type { Database } from "@home-hub/database";
import { refreshTokens } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAccessToken } from "./access-token";
import { createRefreshService } from "./refresh";
import { hashRefreshToken } from "./refresh-token";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const rawRefreshToken = "raw-refresh-token";
const now = new Date("2026-07-23T12:00:00Z");
const futureExpiry = new Date("2026-08-22T12:00:00Z");
const pastExpiry = new Date("2026-06-23T12:00:00Z");

type StoredToken = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
};

function createFakeDatabase(selectResults: Array<StoredToken | undefined>) {
  let selectIndex = 0;
  const inserted: unknown[] = [];
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
    insert: () => ({
      values: async (value: unknown) => {
        inserted.push(value);
      },
    }),
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
    inserted,
    lockStrengths,
    selectWhereClauses,
    updates,
    selectCallCount: () => selectIndex,
  };
}

describe("refresh service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns invalid_token when the refresh token is unknown", async () => {
    const { db, inserted, lockStrengths, selectWhereClauses, updates } =
      createFakeDatabase([undefined]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
    ]);
    expect(lockStrengths).toEqual(["update"]);
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("returns invalid_token when the refresh token is expired", async () => {
    const { db, inserted, updates } = createFakeDatabase([
      {
        id: "token-1",
        userId,
        expiresAt: pastExpiry,
        revokedAt: null,
        replacedById: null,
      },
    ]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("returns invalid_token when the refresh token expires exactly now", async () => {
    const { db, inserted, updates } = createFakeDatabase([
      {
        id: "token-1",
        userId,
        expiresAt: now,
        revokedAt: null,
        replacedById: null,
      },
    ]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("rotates a valid refresh token and returns a new access token", async () => {
    const storedToken = {
      id: "token-1",
      userId,
      expiresAt: futureExpiry,
      revokedAt: null,
      replacedById: null,
    };
    const { db, inserted, lockStrengths, selectWhereClauses, updates } =
      createFakeDatabase([storedToken]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("Expected a successful refresh");
    }

    const claims = verifyAccessToken({
      token: result.accessToken,
      secret: jwtSecret,
      now,
    });
    expect(claims.sub).toBe(userId);
    expect(result.refreshToken).not.toBe(rawRefreshToken);
    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
    ]);
    expect(lockStrengths).toEqual(["update"]);

    expect(inserted).toHaveLength(1);
    const persistedToken = inserted[0] as
      | {
          id: string;
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        }
      | undefined;

    expect(persistedToken).toBeDefined();
    if (!persistedToken) {
      throw new Error("Expected a replacement refresh token to be persisted");
    }

    expect(persistedToken.userId).toBe(userId);
    expect(persistedToken.expiresAt).toEqual(futureExpiry);
    expect(persistedToken.tokenHash).toBe(
      hashRefreshToken(result.refreshToken),
    );
    expect(persistedToken.tokenHash).not.toBe(result.refreshToken);

    expect(updates).toHaveLength(1);
    expect(updates).toEqual([
      {
        set: {
          revokedAt: now,
          replacedById: persistedToken.id,
          updatedAt: now,
        },
        where: eq(refreshTokens.id, storedToken.id),
      },
    ]);
  });

  it("walks through revoked descendants and revokes the active end of the chain", async () => {
    const storedToken = {
      id: "token-1",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:00:00Z"),
      replacedById: "token-2",
    };
    const revokedDescendant = {
      id: "token-2",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:05:00Z"),
      replacedById: "token-3",
    };
    const activeDescendant = {
      id: "token-3",
      userId,
      expiresAt: futureExpiry,
      revokedAt: null,
      replacedById: null,
    };
    const {
      db,
      inserted,
      lockStrengths,
      selectCallCount,
      selectWhereClauses,
      updates,
    } = createFakeDatabase([storedToken, revokedDescendant, activeDescendant]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(selectCallCount()).toBe(3);
    expect(selectWhereClauses).toEqual([
      eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)),
      eq(refreshTokens.id, "token-2"),
      eq(refreshTokens.id, "token-3"),
    ]);
    expect(lockStrengths).toEqual(["update", "update", "update"]);
    expect(inserted).toHaveLength(0);
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

  it("revokes the active descendant when a revoked token is reused", async () => {
    const storedToken = {
      id: "token-1",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:00:00Z"),
      replacedById: "token-2",
    };
    const activeDescendant = {
      id: "token-2",
      userId,
      expiresAt: futureExpiry,
      revokedAt: null,
      replacedById: null,
    };
    const { db, inserted, updates, selectCallCount } = createFakeDatabase([
      storedToken,
      activeDescendant,
    ]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(selectCallCount()).toBe(2);
    expect(inserted).toHaveLength(0);
    expect(updates).toEqual([
      {
        set: {
          revokedAt: now,
          updatedAt: now,
        },
        where: eq(refreshTokens.id, "token-2"),
      },
    ]);
  });

  it("returns invalid_token for a revoked token whose descendants are already revoked", async () => {
    const storedToken = {
      id: "token-1",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:00:00Z"),
      replacedById: "token-2",
    };
    const revokedDescendant = {
      id: "token-2",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:05:00Z"),
      replacedById: null,
    };
    const { db, inserted, updates } = createFakeDatabase([
      storedToken,
      revokedDescendant,
    ]);
    const refresh = createRefreshService({ db, jwtSecret });

    const result = await refresh(rawRefreshToken);

    expect(result).toEqual({ kind: "invalid_token" });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("throws when a revoked token points at a missing replacement", async () => {
    const storedToken = {
      id: "token-1",
      userId,
      expiresAt: futureExpiry,
      revokedAt: new Date("2026-07-22T12:00:00Z"),
      replacedById: "missing-token",
    };
    const { db, inserted, lockStrengths, updates } = createFakeDatabase([
      storedToken,
      undefined,
    ]);
    const refresh = createRefreshService({ db, jwtSecret });

    await expect(refresh(rawRefreshToken)).rejects.toThrow(
      "Broken refresh-token chain",
    );
    expect(lockStrengths).toEqual(["update", "update"]);
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
