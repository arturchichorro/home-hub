import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signAccessToken } from "./access-token";
import { type AuthEnv, createBearerAuth } from "./bearer-auth";

const jwtSecret = "test-jwt-secret-that-is-long-enough";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const now = new Date("2026-07-24T12:00:00Z");

function createAccessToken(input?: {
  secret?: string;
  issuedAt?: Date;
  ttlSeconds?: number;
}) {
  return signAccessToken({
    userId,
    jwtId: "jwt-123",
    secret: input?.secret ?? jwtSecret,
    now: input?.issuedAt ?? now,
    ...(input?.ttlSeconds !== undefined
      ? { ttlSeconds: input.ttlSeconds }
      : {}),
  });
}

function createProtectedApp() {
  const app = new Hono<AuthEnv>();
  const bearerAuth = createBearerAuth(jwtSecret);

  app.get("/", bearerAuth, (c) => c.json({ userId: c.get("userId") }));
  app.get("/throws", bearerAuth, () => {
    throw new Error("Downstream failure");
  });

  return app;
}

describe("bearer authentication", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, "Basic credentials", "Bearer", "Bearer token extra"])(
    "rejects a missing or malformed authorization value: %s",
    async (value) => {
      const app = createProtectedApp();

      const response = await app.request("/", {
        ...(value ? { headers: { Authorization: value } } : {}),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    },
  );

  it("rejects a token signed with another secret", async () => {
    const app = createProtectedApp();
    const token = createAccessToken({ secret: "another-secret" });

    const response = await app.request("/", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects an expired token", async () => {
    const app = createProtectedApp();
    const token = createAccessToken({
      issuedAt: new Date("2026-07-24T11:58:00Z"),
      ttlSeconds: 60,
    });

    const response = await app.request("/", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("exposes the verified user ID to downstream handlers", async () => {
    const app = createProtectedApp();
    const token = createAccessToken();

    const response = await app.request("/", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId });
  });

  it("accepts a case-insensitive bearer scheme", async () => {
    const app = createProtectedApp();
    const token = createAccessToken();

    const response = await app.request("/", {
      headers: { Authorization: `bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId });
  });

  it("does not convert downstream failures into authentication failures", async () => {
    const app = createProtectedApp();
    const token = createAccessToken();

    const response = await app.request("/throws", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(500);
  });
});
