import type { createDbClient } from "@home-hub/database/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAccessToken } from "./access-token";
import { createLoginService } from "./login";
import { hashPassword, verifyPassword } from "./password";
import { hashRefreshToken } from "./refresh-token";

vi.mock("./password", () => ({
  hashPassword: vi.fn(async () => "dummy-password-hash"),
  verifyPassword: vi.fn(),
}));

const jwtSecret = "test-jwt-secret";
const refreshTokenTtlMilliseconds = 30 * 24 * 60 * 60 * 1000;

const storedUser = {
  id: "9f8a6942-f721-499d-957d-7bb3ed1158db",
  username: "artur",
  email: "artur@example.com",
  passwordHash: "stored-password-hash",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase(user: typeof storedUser | undefined) {
  const findFirst = vi.fn(async () => user);
  const values = vi.fn(async (_value: unknown) => undefined);
  const insert = vi.fn(() => ({ values }));
  const db = {
    query: { users: { findFirst } },
    insert,
  } as unknown as Database;

  return { db, findFirst, insert, values };
}

describe("login service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a public user and persists a hashed refresh token for valid credentials", async () => {
    const { db, findFirst, insert, values } = createFakeDatabase(storedUser);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const login = createLoginService({ db, jwtSecret });
    const beforeLogin = Date.now();

    const result = await login({
      email: storedUser.email,
      password: "correct password",
    });

    const afterLogin = Date.now();
    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("Expected a successful login");
    }

    expect(findFirst).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith({
      password: "correct password",
      passwordHash: storedUser.passwordHash,
    });
    expect(result.user).toEqual({
      id: storedUser.id,
      username: storedUser.username,
      email: storedUser.email,
    });
    expect(result.user).not.toHaveProperty("passwordHash");

    const claims = verifyAccessToken({
      token: result.accessToken,
      secret: jwtSecret,
    });
    expect(claims.sub).toBe(storedUser.id);

    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
    const persistedToken = values.mock.calls[0]?.[0] as
      | {
          id: string;
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        }
      | undefined;

    expect(persistedToken).toBeDefined();
    if (!persistedToken) {
      throw new Error("Expected a refresh token to be persisted");
    }

    expect(persistedToken.userId).toBe(storedUser.id);
    expect(persistedToken.tokenHash).toBe(
      hashRefreshToken(result.refreshToken),
    );
    expect(persistedToken.tokenHash).not.toBe(result.refreshToken);
    expect(persistedToken.expiresAt.getTime()).toBeGreaterThanOrEqual(
      beforeLogin + refreshTokenTtlMilliseconds,
    );
    expect(persistedToken.expiresAt.getTime()).toBeLessThanOrEqual(
      afterLogin + refreshTokenTtlMilliseconds,
    );
  });

  it("uses the dummy hash and returns invalid credentials for an unknown email", async () => {
    const { db, values } = createFakeDatabase(undefined);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const login = createLoginService({ db, jwtSecret });

    const result = await login({
      email: "unknown@example.com",
      password: "submitted password",
    });

    expect(hashPassword).toHaveBeenCalledWith("not-a-real-user-password");
    expect(verifyPassword).toHaveBeenCalledWith({
      password: "submitted password",
      passwordHash: "dummy-password-hash",
    });
    expect(result).toEqual({ kind: "invalid_credentials" });
    expect(values).not.toHaveBeenCalled();
  });

  it("returns the same invalid-credentials result for an incorrect password", async () => {
    const { db, values } = createFakeDatabase(storedUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const login = createLoginService({ db, jwtSecret });

    const result = await login({
      email: storedUser.email,
      password: "incorrect password",
    });

    expect(verifyPassword).toHaveBeenCalledWith({
      password: "incorrect password",
      passwordHash: storedUser.passwordHash,
    });
    expect(result).toEqual({ kind: "invalid_credentials" });
    expect(values).not.toHaveBeenCalled();
  });
});
