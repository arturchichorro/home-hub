import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  ListHouseholdInvitesInput,
  ListHouseholdInvitesResult,
} from "../list-invites";
import type {
  ListHouseholdMembersInput,
  ListHouseholdMembersResult,
} from "../list-members";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

type ServiceOverrides = {
  listHouseholdInvites?: (
    input: ListHouseholdInvitesInput,
  ) => Promise<ListHouseholdInvitesResult>;
  listHouseholdMembers?: (
    input: ListHouseholdMembersInput,
  ) => Promise<ListHouseholdMembersResult>;
};

function createTestRoutes(overrides: ServiceOverrides = {}) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites:
      overrides.listHouseholdInvites ?? (async () => ({ kind: "forbidden" })),
    listHouseholdMembers:
      overrides.listHouseholdMembers ?? (async () => ({ kind: "forbidden" })),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function getResource({
  app,
  resource,
  accessToken,
  requestedHouseholdId = householdId,
}: {
  app: ReturnType<typeof createHouseholdRoutes>;
  resource: "members" | "invites";
  accessToken?: string;
  requestedHouseholdId?: string;
}) {
  return app.request(`/${requestedHouseholdId}/${resource}`, {
    ...(accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {}),
  });
}

describe.each(["members", "invites"] as const)(
  "GET household %s",
  (resource) => {
    it("requires bearer authentication", async () => {
      const listHouseholdInvites = vi.fn(
        async (): Promise<ListHouseholdInvitesResult> => ({
          kind: "forbidden",
        }),
      );
      const listHouseholdMembers = vi.fn(
        async (): Promise<ListHouseholdMembersResult> => ({
          kind: "forbidden",
        }),
      );
      const app = createTestRoutes({
        listHouseholdInvites,
        listHouseholdMembers,
      });

      const response = await getResource({ app, resource });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
      expect(listHouseholdInvites).not.toHaveBeenCalled();
      expect(listHouseholdMembers).not.toHaveBeenCalled();
    });

    it("rejects an invalid household id before invoking a service", async () => {
      const listHouseholdInvites = vi.fn(
        async (): Promise<ListHouseholdInvitesResult> => ({
          kind: "forbidden",
        }),
      );
      const listHouseholdMembers = vi.fn(
        async (): Promise<ListHouseholdMembersResult> => ({
          kind: "forbidden",
        }),
      );
      const app = createTestRoutes({
        listHouseholdInvites,
        listHouseholdMembers,
      });

      const response = await getResource({
        app,
        resource,
        accessToken: createAccessToken(),
        requestedHouseholdId: "not-a-uuid",
      });

      expect(response.status).toBe(400);
      expect(listHouseholdInvites).not.toHaveBeenCalled();
      expect(listHouseholdMembers).not.toHaveBeenCalled();
    });
  },
);

describe("household management list routes", () => {
  it("returns the safe member roster", async () => {
    const members = [
      {
        id: "7dbb2304-955a-4d0b-9878-d39a42a38eb2",
        username: "artur",
        role: "owner" as const,
        joinedAt: new Date("2026-08-01T12:00:00Z"),
      },
    ];
    const listHouseholdMembers = vi.fn(async () => ({
      kind: "success" as const,
      members,
    }));
    const app = createTestRoutes({ listHouseholdMembers });

    const response = await getResource({
      app,
      resource: "members",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      members: [
        {
          ...members[0],
          joinedAt: "2026-08-01T12:00:00.000Z",
        },
      ],
    });
    expect(listHouseholdMembers).toHaveBeenCalledWith({ userId, householdId });
  });

  it("returns only pending invite metadata", async () => {
    const invites = [
      {
        id: "e467b00a-5f80-4c13-aa5b-d2e59996dd82",
        createdAt: new Date("2026-08-01T12:00:00Z"),
        expiresAt: new Date("2026-08-08T12:00:00Z"),
      },
    ];
    const listHouseholdInvites = vi.fn(async () => ({
      kind: "success" as const,
      invites,
    }));
    const app = createTestRoutes({ listHouseholdInvites });

    const response = await getResource({
      app,
      resource: "invites",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invites: [
        {
          id: invites[0]?.id,
          createdAt: "2026-08-01T12:00:00.000Z",
          expiresAt: "2026-08-08T12:00:00.000Z",
        },
      ],
    });
    expect(listHouseholdInvites).toHaveBeenCalledWith({ userId, householdId });
  });

  it.each(["members", "invites"] as const)(
    "maps forbidden %s access to 403",
    async (resource) => {
      const app = createTestRoutes();

      const response = await getResource({
        app,
        resource,
        accessToken: createAccessToken(),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    },
  );

  it.each(["members", "invites"] as const)(
    "maps a missing authenticated user for %s to 401",
    async (resource) => {
      const app = createTestRoutes({
        listHouseholdInvites: async () => ({ kind: "unauthorized" }),
        listHouseholdMembers: async () => ({ kind: "unauthorized" }),
      });

      const response = await getResource({
        app,
        resource,
        accessToken: createAccessToken(),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    },
  );
});
