import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../../auth/access-token";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const linkId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const now = new Date("2026-09-18T12:00:00.000Z");
const expiresAt = new Date("2026-12-17T12:00:00.000Z");
const link = {
  id: linkId,
  householdId,
  name: "Kitchen QR",
  access: "write" as const,
  expiresAt,
  disabledAt: null,
  createdAt: now,
  updatedAt: now,
};

function createToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(overrides: Record<string, unknown> = {}) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    deleteHousehold: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    leaveHousehold: async () => ({ kind: "forbidden" }),
    transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
    setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    createGuestAccessLink: async () => ({ kind: "forbidden" }),
    listGuestAccessLinks: async () => ({ kind: "forbidden" }),
    regenerateGuestAccessLink: async () => ({ kind: "forbidden" }),
    updateGuestAccessLink: async () => ({ kind: "forbidden" }),
    ...overrides,
    jwtSecret,
  });
}

function request(path: string, method: string, body?: unknown) {
  return {
    path,
    init: {
      method,
      headers: {
        Authorization: `Bearer ${createToken()}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  };
}

describe("Guest access link routes", () => {
  it("creates a link and returns its one-time raw token", async () => {
    const createGuestAccessLink = vi.fn(async () => ({
      kind: "success" as const,
      link,
      token: "a".repeat(43),
    }));
    const app = createTestRoutes({ createGuestAccessLink });
    const input = request(`/${householdId}/guest-access-links`, "POST", {
      name: " Kitchen QR ",
      access: "write",
    });

    const response = await app.request(input.path, input.init);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      link: { id: linkId, token: "a".repeat(43) },
    });
    expect(createGuestAccessLink).toHaveBeenCalledWith({
      userId,
      householdId,
      name: "Kitchen QR",
      access: "write",
    });
  });

  it("lists links without exposing their token hashes", async () => {
    const listGuestAccessLinks = vi.fn(async () => ({
      kind: "success" as const,
      links: [link],
    }));
    const app = createTestRoutes({ listGuestAccessLinks });
    const input = request(`/${householdId}/guest-access-links`, "GET");

    const response = await app.request(input.path, input.init);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      links: [
        {
          ...link,
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
    });
  });

  it("updates access and enabled state through an owner-authorized service", async () => {
    const updateGuestAccessLink = vi.fn(async () => ({
      kind: "success" as const,
      link: { ...link, access: "read" as const },
    }));
    const app = createTestRoutes({ updateGuestAccessLink });
    const input = request(
      `/${householdId}/guest-access-links/${linkId}`,
      "PATCH",
      { access: "read", enabled: false },
    );

    const response = await app.request(input.path, input.init);

    expect(response.status).toBe(200);
    expect(updateGuestAccessLink).toHaveBeenCalledWith({
      userId,
      householdId,
      guestAccessLinkId: linkId,
      access: "read",
      enabled: false,
    });
  });

  it("passes expiration updates to the server-authorized service", async () => {
    const updateGuestAccessLink = vi.fn(async () => ({
      kind: "success" as const,
      link: { ...link, expiresAt: new Date("2027-01-01T00:00:00.000Z") },
    }));
    const app = createTestRoutes({ updateGuestAccessLink });
    const path = `/${householdId}/guest-access-links/${linkId}`;

    const futureResponse = await app.request(
      path,
      request(path, "PATCH", {
        expiresAt: "2027-01-01T00:00:00.000Z",
      }).init,
    );
    expect(futureResponse.status).toBe(200);
    expect(updateGuestAccessLink).toHaveBeenCalledWith({
      userId,
      householdId,
      guestAccessLinkId: linkId,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("maps server-side expiration validation failures to a bad request", async () => {
    const updateGuestAccessLink = vi.fn(async () => ({
      kind: "invalid_expiration" as const,
    }));
    const app = createTestRoutes({ updateGuestAccessLink });
    const path = `/${householdId}/guest-access-links/${linkId}`;

    const response = await app.request(
      path,
      request(path, "PATCH", {
        expiresAt: "2026-09-18T12:00:00.000Z",
      }).init,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
  });

  it("regenerates a link and returns only the replacement raw token", async () => {
    const regenerateGuestAccessLink = vi.fn(async () => ({
      kind: "success" as const,
      link,
      token: "b".repeat(43),
    }));
    const app = createTestRoutes({ regenerateGuestAccessLink });
    const input = request(
      `/${householdId}/guest-access-links/${linkId}/regenerate`,
      "POST",
    );

    const response = await app.request(input.path, input.init);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      link: { id: linkId, token: "b".repeat(43) },
    });
  });
});
