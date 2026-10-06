import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import { createGuestLinkRoutes as createFeatureRoutes } from "./routes";
import type { GuestLinkService } from "./service";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const jwtSecret = "test-secret";
const path = `/api/households/${householdId}/guest-access-links`;
function setup() {
  const service = {
    create: vi.fn(async () => ({
      kind: "success",
      link: { id: "link" },
      credential: "one-time-secret",
    })),
    list: vi.fn(async () => ({ kind: "success", links: [] })),
    disable: vi.fn(async () => ({ kind: "success" })),
  };
  const app = new Hono().route(
    "/api/households/:householdId/guest-access-links",
    createGuestLinkRoutes({
      jwtSecret,
      service: service as unknown as GuestLinkService,
    }),
  );
  const headers = {
    Authorization: `Bearer ${signAccessToken({ userId, jwtId: "test", secret: jwtSecret })}`,
    "Content-Type": "application/json",
  };
  return { app, service, headers };
}
describe("owner Guest link API", () => {
  it("requires account Bearer authentication", async () => {
    const { app, service } = setup();
    for (const authorization of ["", "Bearer hhg_v1_abc", "Guest abc"]) {
      expect(
        (await app.request(path, { headers: { Authorization: authorization } }))
          .status,
      ).toBe(401);
    }
    expect(service.list).not.toHaveBeenCalled();
  });
  it("returns a non-cacheable one-time credential on creation", async () => {
    const { app, service, headers } = setup();
    const response = await app.request(path, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Kitchen", access: "read" }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      credential: "one-time-secret",
    });
    expect(service.create).toHaveBeenCalledWith({
      userId,
      householdId,
      name: "Kitchen",
      access: "read",
    });
  });
  it.each([
    { name: "", access: "read" },
    { name: "Kitchen", access: "admin" },
    { name: "Kitchen", access: "read", token: "chosen" },
    { name: "Kitchen", access: "read", expiresAt: "invalid" },
  ])("rejects invalid creation input", async (body) => {
    const { app, service, headers } = setup();
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("has no edit, regenerate, or re-enable endpoint", async () => {
    const { app, headers } = setup();
    for (const suffix of ["/link/regenerate", "/link/enable"])
      expect(
        (await app.request(path + suffix, { method: "POST", headers })).status,
      ).toBe(404);
    expect(
      (await app.request(`${path}/link`, { method: "PATCH", headers })).status,
    ).toBe(404);
  });
});

function createGuestLinkRoutes(
  input: Parameters<typeof createFeatureRoutes>[0] & { jwtSecret: string },
) {
  const app = new Hono<AuthEnv>();
  app.use("*", createBearerAuth(input.jwtSecret));
  return app.route("/", createFeatureRoutes(input));
}
