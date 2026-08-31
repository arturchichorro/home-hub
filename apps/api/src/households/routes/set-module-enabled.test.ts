import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../../auth/access-token";
import type { SetHouseholdModuleEnabledResult } from "../set-module-enabled";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const token = signAccessToken({
  userId,
  jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
  secret: jwtSecret,
});

function app(
  setHouseholdModuleEnabled: () => Promise<SetHouseholdModuleEnabledResult>,
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
    transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
    setHouseholdModuleEnabled,
    jwtSecret,
  });
}

describe("set household module enabled route", () => {
  it("validates, authenticates, and forwards the command", async () => {
    const service = vi.fn(async () => ({
      kind: "success" as const,
      setting: { moduleKey: "lists" as const, enabled: false },
    }));
    const response = await app(service).request(
      `/${householdId}/modules/lists`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledWith({
      userId,
      householdId,
      moduleKey: "lists",
      enabled: false,
    });
  });

  it.each([
    ["bad-id", "lists", { enabled: true }],
    [householdId, "unknown", { enabled: true }],
    [householdId, "lists", { enabled: "true" }],
  ])("rejects an invalid request", async (id, key, body) => {
    const service = vi.fn(async () => ({ kind: "forbidden" as const }));
    const response = await app(service).request(`/${id}/modules/${key}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthorized", 401],
    ["forbidden", 403],
    ["module_not_configured", 409],
  ] as const)("maps %s", async (kind, status) => {
    const response = await app(async () => ({ kind })).request(
      `/${householdId}/modules/recipes`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(response.status).toBe(status);
  });
});
