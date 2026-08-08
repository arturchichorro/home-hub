import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  AcceptHouseholdInviteInput,
  AcceptHouseholdInviteResult,
} from "../accept-invite";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const token = "a".repeat(43);

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(
  acceptHouseholdInvite: (
    input: AcceptHouseholdInviteInput,
  ) => Promise<AcceptHouseholdInviteResult> = async () => ({
    kind: "invalid_invite",
  }),
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite,
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function postAcceptInvite(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  body: string;
  accessToken?: string;
}) {
  return input.app.request("/invites/accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken
        ? { Authorization: `Bearer ${input.accessToken}` }
        : {}),
    },
    body: input.body,
  });
}

describe("accept household invite route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const acceptHouseholdInvite = vi.fn(
      async (): Promise<AcceptHouseholdInviteResult> => ({
        kind: "invalid_invite",
      }),
    );
    const app = createTestRoutes(acceptHouseholdInvite);

    const response = await postAcceptInvite({
      app,
      body: JSON.stringify({ token }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(acceptHouseholdInvite).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking the service", async () => {
    const acceptHouseholdInvite = vi.fn(
      async (): Promise<AcceptHouseholdInviteResult> => ({
        kind: "invalid_invite",
      }),
    );
    const app = createTestRoutes(acceptHouseholdInvite);

    const response = await postAcceptInvite({
      app,
      body: "{",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(acceptHouseholdInvite).not.toHaveBeenCalled();
  });

  it.each([
    { token: "" },
    { token: "a".repeat(42) },
    { token: "a".repeat(44) },
    { token, unexpected: true },
  ])(
    "rejects an invalid request without invoking the service: %o",
    async (body) => {
      const acceptHouseholdInvite = vi.fn(
        async (): Promise<AcceptHouseholdInviteResult> => ({
          kind: "invalid_invite",
        }),
      );
      const app = createTestRoutes(acceptHouseholdInvite);

      const response = await postAcceptInvite({
        app,
        body: JSON.stringify(body),
        accessToken: createAccessToken(),
      });

      expect(response.status).toBe(400);
      expect(acceptHouseholdInvite).not.toHaveBeenCalled();
    },
  );

  it("passes the authenticated user and raw token to the service", async () => {
    const membership = {
      id: "7fc71398-7c45-4e3d-9062-3e483847cc74",
      householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      role: "member" as const,
    };
    const acceptHouseholdInvite = vi.fn(
      async (): Promise<AcceptHouseholdInviteResult> => ({
        kind: "success",
        membership,
      }),
    );
    const app = createTestRoutes(acceptHouseholdInvite);

    const response = await postAcceptInvite({
      app,
      body: JSON.stringify({ token }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ membership });
    expect(acceptHouseholdInvite).toHaveBeenCalledWith({
      userId,
      token,
    });
  });

  it.each([
    ["invalid_invite", 400, "Invalid invite"],
    ["already_member", 409, "Already a member"],
  ] as const)("maps %s to %i", async (kind, status, error) => {
    const app = createTestRoutes(async () => ({ kind }));

    const response = await postAcceptInvite({
      app,
      body: JSON.stringify({ token }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await postAcceptInvite({
      app,
      body: JSON.stringify({ token }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });
});
