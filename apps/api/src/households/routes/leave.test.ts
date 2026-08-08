import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { LeaveHouseholdInput, LeaveHouseholdResult } from "../leave";
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
  leaveHousehold: (input: LeaveHouseholdInput) => Promise<LeaveHouseholdResult>,
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    leaveHousehold,
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function deleteMembership(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  accessToken?: string;
  householdId?: string;
}) {
  return input.app.request(`/${input.householdId ?? householdId}/membership`, {
    method: "DELETE",
    ...(input.accessToken
      ? { headers: { Authorization: `Bearer ${input.accessToken}` } }
      : {}),
  });
}

describe("leave household route", () => {
  it("requires authentication before invoking the service", async () => {
    const leaveHousehold = vi.fn(
      async (): Promise<LeaveHouseholdResult> => ({ kind: "success" }),
    );
    const response = await deleteMembership({
      app: createTestRoutes(leaveHousehold),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(leaveHousehold).not.toHaveBeenCalled();
  });

  it("rejects an invalid household id", async () => {
    const leaveHousehold = vi.fn(
      async (): Promise<LeaveHouseholdResult> => ({ kind: "success" }),
    );
    const response = await deleteMembership({
      app: createTestRoutes(leaveHousehold),
      accessToken: createAccessToken(),
      householdId: "invalid-household",
    });

    expect(response.status).toBe(400);
    expect(leaveHousehold).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and household id to the service", async () => {
    const leaveHousehold = vi.fn(
      async (): Promise<LeaveHouseholdResult> => ({ kind: "success" }),
    );
    const response = await deleteMembership({
      app: createTestRoutes(leaveHousehold),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(leaveHousehold).toHaveBeenCalledWith({ userId, householdId });
  });

  it.each([
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["owner_must_transfer", 409, "Transfer ownership before leaving"],
  ] as const)("maps %s to %s", async (kind, status, error) => {
    const response = await deleteMembership({
      app: createTestRoutes(async () => ({ kind })),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    if (kind === "unauthorized") {
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    }
  });
});
