import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  TransferHouseholdOwnershipInput,
  TransferHouseholdOwnershipResult,
} from "../transfer-ownership";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(
  transferHouseholdOwnership: (
    input: TransferHouseholdOwnershipInput,
  ) => Promise<TransferHouseholdOwnershipResult>,
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    leaveHousehold: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    transferHouseholdOwnership,
    setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function patchOwnership(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  body: string;
  accessToken?: string;
  householdId?: string;
}) {
  return input.app.request(`/${input.householdId ?? householdId}/ownership`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken
        ? { Authorization: `Bearer ${input.accessToken}` }
        : {}),
    },
    body: input.body,
  });
}

describe("transfer household ownership route", () => {
  it("requires authentication before invoking the service", async () => {
    const transferHouseholdOwnership = vi.fn(
      async (): Promise<TransferHouseholdOwnershipResult> => ({
        kind: "success",
      }),
    );
    const response = await patchOwnership({
      app: createTestRoutes(transferHouseholdOwnership),
      body: JSON.stringify({ membershipId }),
    });

    expect(response.status).toBe(401);
    expect(transferHouseholdOwnership).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid-household", JSON.stringify({ membershipId })],
    [householdId, JSON.stringify({ membershipId: "invalid-member" })],
    [householdId, JSON.stringify({ membershipId, unexpected: true })],
    [householdId, "{"],
  ])("rejects an invalid request", async (requestHouseholdId, body) => {
    const transferHouseholdOwnership = vi.fn(
      async (): Promise<TransferHouseholdOwnershipResult> => ({
        kind: "success",
      }),
    );
    const response = await patchOwnership({
      app: createTestRoutes(transferHouseholdOwnership),
      accessToken: createAccessToken(),
      householdId: requestHouseholdId,
      body,
    });

    expect(response.status).toBe(400);
    expect(transferHouseholdOwnership).not.toHaveBeenCalled();
  });

  it("passes authenticated and validated identifiers to the service", async () => {
    const transferHouseholdOwnership = vi.fn(
      async (): Promise<TransferHouseholdOwnershipResult> => ({
        kind: "success",
      }),
    );
    const response = await patchOwnership({
      app: createTestRoutes(transferHouseholdOwnership),
      accessToken: createAccessToken(),
      body: JSON.stringify({ membershipId }),
    });

    expect(response.status).toBe(204);
    expect(transferHouseholdOwnership).toHaveBeenCalledWith({
      userId,
      householdId,
      membershipId,
    });
  });

  it.each([
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["invalid_member", 404, "Invalid member"],
  ] as const)("maps %s to %s", async (kind, status, error) => {
    const response = await patchOwnership({
      app: createTestRoutes(async () => ({ kind })),
      accessToken: createAccessToken(),
      body: JSON.stringify({ membershipId }),
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });
});
