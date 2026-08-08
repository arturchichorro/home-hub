import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  CreateHouseholdInviteInput,
  CreateHouseholdInviteResult,
} from "../create-invite";
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

function createTestRoutes(
  createHouseholdInvite: (
    input: CreateHouseholdInviteInput,
  ) => Promise<CreateHouseholdInviteResult> = async () => ({
    kind: "forbidden",
  }),
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite,
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    leaveHousehold: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function postInvite(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  householdId: string;
  accessToken?: string;
}) {
  return input.app.request(`/${input.householdId}/invites`, {
    method: "POST",
    ...(input.accessToken
      ? { headers: { Authorization: `Bearer ${input.accessToken}` } }
      : {}),
  });
}

describe("create household invite route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const createHouseholdInvite = vi.fn(
      async (): Promise<CreateHouseholdInviteResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(createHouseholdInvite);

    const response = await postInvite({ app, householdId });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(createHouseholdInvite).not.toHaveBeenCalled();
  });

  it("rejects an invalid household ID without invoking the service", async () => {
    const createHouseholdInvite = vi.fn(
      async (): Promise<CreateHouseholdInviteResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(createHouseholdInvite);

    const response = await postInvite({
      app,
      householdId: "not-a-uuid",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(createHouseholdInvite).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and household ID to the service", async () => {
    const invite = {
      id: "74fc10c9-a82d-4126-918c-0d09d1224a32",
      householdId,
      expiresAt: new Date("2026-08-04T12:00:00Z"),
      token: "raw-household-invite-token",
    };
    const createHouseholdInvite = vi.fn(
      async (): Promise<CreateHouseholdInviteResult> => ({
        kind: "success",
        invite,
      }),
    );
    const app = createTestRoutes(createHouseholdInvite);

    const response = await postInvite({
      app,
      householdId,
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invite: {
        ...invite,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
    expect(createHouseholdInvite).toHaveBeenCalledWith({
      userId,
      householdId,
    });
  });

  it("returns generic forbidden when the user is not the household owner", async () => {
    const app = createTestRoutes();

    const response = await postInvite({
      app,
      householdId,
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
    });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await postInvite({
      app,
      householdId,
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });
});
