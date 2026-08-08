import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  RemoveHouseholdMemberInput,
  RemoveHouseholdMemberResult,
} from "../remove-member";
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

function createTestRoute(
  removeHouseholdMember: (
    input: RemoveHouseholdMemberInput,
  ) => Promise<RemoveHouseholdMemberResult>,
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    removeHouseholdMember,
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function deleteMember(input: {
  app: ReturnType<typeof createTestRoute>;
  accessToken?: string;
  householdId?: string;
  membershipId?: string;
}) {
  return input.app.request(
    `/${input.householdId ?? householdId}/members/${input.membershipId ?? membershipId}`,
    {
      method: "DELETE",
      ...(input.accessToken
        ? { headers: { Authorization: `Bearer ${input.accessToken}` } }
        : {}),
    },
  );
}

describe("remove household member route", () => {
  it("requires authentication before invoking the service", async () => {
    const removeHouseholdMember = vi.fn(
      async (): Promise<RemoveHouseholdMemberResult> => ({ kind: "success" }),
    );
    const response = await deleteMember({
      app: createTestRoute(removeHouseholdMember),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(removeHouseholdMember).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid-household", membershipId],
    [householdId, "invalid-membership"],
  ])(
    "rejects invalid path identifiers",
    async (invalidHouseholdId, invalidMembershipId) => {
      const removeHouseholdMember = vi.fn(
        async (): Promise<RemoveHouseholdMemberResult> => ({ kind: "success" }),
      );
      const response = await deleteMember({
        app: createTestRoute(removeHouseholdMember),
        accessToken: createAccessToken(),
        householdId: invalidHouseholdId,
        membershipId: invalidMembershipId,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid request",
      });
      expect(removeHouseholdMember).not.toHaveBeenCalled();
    },
  );

  it("passes authenticated and validated identifiers to the service", async () => {
    const removeHouseholdMember = vi.fn(
      async (): Promise<RemoveHouseholdMemberResult> => ({ kind: "success" }),
    );
    const response = await deleteMember({
      app: createTestRoute(removeHouseholdMember),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(removeHouseholdMember).toHaveBeenCalledWith({
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
    const response = await deleteMember({
      app: createTestRoute(async () => ({ kind })),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    if (kind === "unauthorized") {
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    }
  });
});
