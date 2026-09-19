import type { Database } from "@home-hub/database";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import {
  createRequestAccessAuth,
  type RequestAccessEnv,
} from "./request-access";

const jwtSecret = "test-jwt-secret";
const accountId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const guestAccessLinkId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";

function createDatabase(guest: boolean) {
  const limit = vi.fn(async () =>
    guest
      ? [
          {
            guestAccessLinkId,
            householdId,
            permission: "write" as const,
          },
        ]
      : [],
  );
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit,
  };
  return {
    db: { select: vi.fn(() => builder) } as unknown as Database,
    limit,
  };
}

function createApp(db: Database) {
  const app = new Hono<RequestAccessEnv>();
  app.use("/*", createRequestAccessAuth({ db, jwtSecret }));
  app.get("/scope", (c) => c.json(c.get("requestAccess")));
  return app;
}

describe("request access authentication", () => {
  it("accepts account JWTs only under the Bearer scheme", async () => {
    const fixture = createDatabase(false);
    const token = signAccessToken({
      userId: accountId,
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await createApp(fixture.db).request("/scope", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: { kind: "account", accountId },
    });
    expect(fixture.limit).not.toHaveBeenCalled();
  });

  it("resolves direct Guest credentials to trusted link scope", async () => {
    const fixture = createDatabase(true);
    const response = await createApp(fixture.db).request("/scope", {
      headers: { Authorization: `Guest ${"g".repeat(43)}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: { kind: "guest", guestAccessLinkId },
      householdScope: { householdId, permission: "write" },
    });
  });

  it("does not accept an account JWT under the Guest scheme", async () => {
    const token = signAccessToken({
      userId: accountId,
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });
    const response = await createApp(createDatabase(false).db).request(
      "/scope",
      { headers: { Authorization: `Guest ${token}` } },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it.each(["", "Basic token", "Guest unknown"])(
    "returns one generic failure for invalid credentials (%s)",
    async (authorization) => {
      const response = await createApp(createDatabase(false).db).request(
        "/scope",
        authorization ? { headers: { Authorization: authorization } } : {},
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer, Guest");
    },
  );
});
