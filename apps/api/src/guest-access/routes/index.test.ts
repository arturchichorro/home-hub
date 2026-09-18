import { describe, expect, it, vi } from "vitest";
import { createGuestAccessRoutes } from ".";

const sessionToken = "s".repeat(43);
const session = {
  accessToken: "guest.jwt.token",
  access: "write" as const,
  cacheIdentity: "guest:8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  household: {
    id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    name: "Coliving",
  },
  sessionToken,
};

function createRoutes(overrides: Record<string, unknown> = {}) {
  return createGuestAccessRoutes({
    isProduction: true,
    redeemGuestAccess: async () => ({ kind: "invalid_token" }),
    refreshGuestAccess: async () => ({ kind: "invalid_token" }),
    logoutGuestAccess: async () => undefined,
    ...overrides,
  });
}

describe("Guest access session routes", () => {
  it("redeems a QR token into a host-scoped HTTP-only session", async () => {
    const redeemGuestAccess = vi.fn(async () => ({
      kind: "success" as const,
      session,
    }));
    const app = createRoutes({ redeemGuestAccess });

    const response = await app.request("/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "q".repeat(43) }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: session.accessToken,
      access: "write",
      cacheIdentity: session.cacheIdentity,
      household: session.household,
    });
    expect(response.headers.get("set-cookie")).toContain(
      `home_hub_guest=${sessionToken}`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("refreshes from the inaccessible cookie instead of the QR secret", async () => {
    const refreshGuestAccess = vi.fn(async () => ({
      kind: "success" as const,
      session,
    }));
    const app = createRoutes({ refreshGuestAccess });

    const response = await app.request("/refresh", {
      method: "POST",
      headers: { Cookie: `home_hub_guest=${sessionToken}` },
    });

    expect(response.status).toBe(200);
    expect(refreshGuestAccess).toHaveBeenCalledWith(sessionToken);
  });

  it("clears invalid sessions without disclosing why access failed", async () => {
    const app = createRoutes();

    const response = await app.request("/refresh", {
      method: "POST",
      headers: { Cookie: `home_hub_guest=${sessionToken}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Guest access is unavailable",
    });
    expect(response.headers.get("set-cookie")).toContain("home_hub_guest=;");
  });

  it("revokes and clears the current device session on logout", async () => {
    const logoutGuestAccess = vi.fn(async () => undefined);
    const app = createRoutes({ logoutGuestAccess });

    const response = await app.request("/logout", {
      method: "POST",
      headers: { Cookie: `home_hub_guest=${sessionToken}` },
    });

    expect(response.status).toBe(204);
    expect(logoutGuestAccess).toHaveBeenCalledWith(sessionToken);
    expect(response.headers.get("set-cookie")).toContain("home_hub_guest=;");
  });

  it("rate-limits repeated redemption attempts without disclosing token state", async () => {
    const redeemGuestAccess = vi.fn(async () => ({
      kind: "invalid_token" as const,
    }));
    const app = createRoutes({ redeemGuestAccess });
    let response: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      response = await app.request("/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.0.2.42",
        },
        body: JSON.stringify({ token: "q".repeat(43) }),
      });
    }

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({
      error: "Guest access is unavailable",
    });
    expect(redeemGuestAccess).toHaveBeenCalledTimes(20);
  });
});
