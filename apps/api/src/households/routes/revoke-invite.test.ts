import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  RevokeHouseholdInviteInput,
  RevokeHouseholdInviteResult,
} from "../revoke-invite";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const inviteId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(
  revokeHouseholdInvite: (
    input: RevokeHouseholdInviteInput,
  ) => Promise<RevokeHouseholdInviteResult>,
) {
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
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite,
    jwtSecret,
  });
}

function deleteInvite(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  accessToken?: string;
  householdId?: string;
  inviteId?: string;
}) {
  return input.app.request(
    `/${input.householdId ?? householdId}/invites/${input.inviteId ?? inviteId}`,
    {
      method: "DELETE",
      ...(input.accessToken
        ? { headers: { Authorization: `Bearer ${input.accessToken}` } }
        : {}),
    },
  );
}

describe("revoke household invite route", () => {
  it("requires authentication before invoking the service", async () => {
    const revokeHouseholdInvite = vi.fn(
      async (): Promise<RevokeHouseholdInviteResult> => ({ kind: "success" }),
    );
    const response = await deleteInvite({
      app: createTestRoutes(revokeHouseholdInvite),
    });

    expect(response.status).toBe(401);
    expect(revokeHouseholdInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid-household", inviteId],
    [householdId, "invalid-invite"],
  ])(
    "rejects invalid path ids",
    async (invalidHouseholdId, invalidInviteId) => {
      const revokeHouseholdInvite = vi.fn(
        async (): Promise<RevokeHouseholdInviteResult> => ({ kind: "success" }),
      );
      const response = await deleteInvite({
        app: createTestRoutes(revokeHouseholdInvite),
        accessToken: createAccessToken(),
        householdId: invalidHouseholdId,
        inviteId: invalidInviteId,
      });

      expect(response.status).toBe(400);
      expect(revokeHouseholdInvite).not.toHaveBeenCalled();
    },
  );

  it("passes authenticated and validated identifiers to the service", async () => {
    const revokeHouseholdInvite = vi.fn(
      async (): Promise<RevokeHouseholdInviteResult> => ({ kind: "success" }),
    );
    const response = await deleteInvite({
      app: createTestRoutes(revokeHouseholdInvite),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(revokeHouseholdInvite).toHaveBeenCalledWith({
      userId,
      householdId,
      inviteId,
    });
  });

  it.each([
    ["unauthorized", 401],
    ["forbidden", 403],
    ["invalid_invite", 404],
  ] as const)("maps %s to %s", async (kind, status) => {
    const response = await deleteInvite({
      app: createTestRoutes(async () => ({ kind })),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(status);
  });
});
