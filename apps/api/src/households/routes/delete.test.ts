import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { DeleteHouseholdInput, DeleteHouseholdResult } from "../delete";
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
  deleteHousehold: (
    input: DeleteHouseholdInput,
  ) => Promise<DeleteHouseholdResult>,
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    deleteHousehold,
    leaveHousehold: async () => ({ kind: "forbidden" }),
    transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
    setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function request(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  accessToken?: string;
  householdId?: string;
}) {
  return input.app.request(`/${input.householdId ?? householdId}`, {
    method: "DELETE",
    ...(input.accessToken
      ? { headers: { Authorization: `Bearer ${input.accessToken}` } }
      : {}),
  });
}

describe("delete household route", () => {
  it("requires authentication", async () => {
    const deleteHousehold = vi.fn(
      async (): Promise<DeleteHouseholdResult> => ({ kind: "success" }),
    );
    const response = await request({ app: createTestRoutes(deleteHousehold) });

    expect(response.status).toBe(401);
    expect(deleteHousehold).not.toHaveBeenCalled();
  });

  it("rejects an invalid household id", async () => {
    const deleteHousehold = vi.fn(
      async (): Promise<DeleteHouseholdResult> => ({ kind: "success" }),
    );
    const response = await request({
      app: createTestRoutes(deleteHousehold),
      accessToken: createAccessToken(),
      householdId: "invalid-household",
    });

    expect(response.status).toBe(400);
    expect(deleteHousehold).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner and household to the service", async () => {
    const deleteHousehold = vi.fn(
      async (): Promise<DeleteHouseholdResult> => ({ kind: "success" }),
    );
    const response = await request({
      app: createTestRoutes(deleteHousehold),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(204);
    expect(deleteHousehold).toHaveBeenCalledWith({ householdId, userId });
  });

  it.each([
    ["unauthorized", 401],
    ["forbidden", 403],
  ] as const)("maps %s to %s", async (kind, status) => {
    const response = await request({
      app: createTestRoutes(async () => ({ kind })),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(status);
  });
});
