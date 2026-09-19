import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { RequestAccessEnv } from "../../authorization/request-access";
import { createGuestAccessRoutes } from ".";

const linkId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const expiresAt = new Date("2026-12-18T12:00:00.000Z");

function createApp(
  getGuestAccessContext: Parameters<
    typeof createGuestAccessRoutes
  >[0]["getGuestAccessContext"],
) {
  const app = new Hono<RequestAccessEnv>();
  app.use("/*", async (c, next) => {
    c.set("requestAccess", {
      actor: { kind: "guest", guestAccessLinkId: linkId },
      householdScope: { householdId, permission: "write" },
    });
    await next();
  });
  app.route("/", createGuestAccessRoutes({ getGuestAccessContext }));
  return app;
}

describe("Guest access context route", () => {
  it("returns only non-secret shell metadata", async () => {
    const getGuestAccessContext = vi.fn(async () => ({
      kind: "success" as const,
      context: {
        guestAccessLinkId: linkId,
        access: "write" as const,
        cacheIdentity: `guest-link:${linkId}`,
        expiresAt,
        enabledModules: ["recipes" as const],
        household: { id: householdId, name: "Coliving" },
      },
    }));
    const response = await createApp(getGuestAccessContext).request("/context");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      guestAccessLinkId: linkId,
      access: "write",
      cacheIdentity: `guest-link:${linkId}`,
      expiresAt: expiresAt.toISOString(),
      enabledModules: ["recipes"],
      household: { id: householdId, name: "Coliving" },
    });
  });

  it("uses a generic unavailable response", async () => {
    const response = await createApp(async () => ({
      kind: "unavailable",
    })).request("/context");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
