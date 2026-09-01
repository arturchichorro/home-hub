import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptHouseholdInvite,
  createHousehold,
  createHouseholdInvite,
  deleteHousehold,
  leaveHousehold,
  listHouseholdInvites,
  listHouseholdMembers,
  removeHouseholdMember,
  renameHousehold,
  revokeHouseholdInvite,
  setHouseholdModuleEnabled,
  transferHouseholdOwnership,
} from "./api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("setHouseholdModuleEnabled", () => {
  it("sends the authenticated toggle command", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ setting: { moduleKey: "lists", enabled: false } }),
    );
    await expect(
      setHouseholdModuleEnabled({
        accessToken: "access-token",
        householdId,
        moduleKey: "lists",
        enabled: false,
      }),
    ).resolves.toEqual({ kind: "success" });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/modules/lists`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "module_not_configured"],
  ] as const)("maps %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(
      setHouseholdModuleEnabled({
        accessToken: "token",
        householdId,
        moduleKey: "recipes",
        enabled: true,
      }),
    ).resolves.toEqual({ kind });
  });

  it("throws for an unexpected failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      setHouseholdModuleEnabled({
        accessToken: "token",
        householdId,
        moduleKey: "recipes",
        enabled: true,
      }),
    ).rejects.toThrow("Failed to update household module");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleteHousehold", () => {
  it("sends the authenticated delete command", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      deleteHousehold({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind: "success" });
    expect(fetchMock).toHaveBeenCalledWith(`/api/households/${householdId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer access-token" },
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(
      deleteHousehold({ accessToken: "token", householdId }),
    ).resolves.toEqual({ kind });
  });
});

describe("createHousehold", () => {
  it("normalizes the name and returns the created household", async () => {
    const household = { id: householdId, name: "Rue des Mimosas" };
    fetchMock.mockResolvedValueOnce(
      Response.json({ household }, { status: 201 }),
    );

    await expect(
      createHousehold({
        accessToken: "access-token",
        name: "  Rue des Mimosas  ",
      }),
    ).resolves.toEqual({ kind: "success", household });

    expect(fetchMock).toHaveBeenCalledWith("/api/households", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Rue des Mimosas" }),
    });
  });

  it("reports an expired access session", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(
      createHousehold({ accessToken: "expired", name: "Home" }),
    ).resolves.toEqual({ kind: "unauthorized" });
  });

  it("rejects an invalid name before making a request", async () => {
    await expect(
      createHousehold({ accessToken: "access-token", name: "   " }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ household: { id: "not-a-uuid", name: "Home" } }),
    );

    await expect(
      createHousehold({ accessToken: "access-token", name: "Home" }),
    ).rejects.toThrow();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      createHousehold({ accessToken: "access-token", name: "Home" }),
    ).rejects.toThrow("Failed to create household");
  });
});

describe("acceptHouseholdInvite", () => {
  const token = "a".repeat(43);
  const membership = {
    id: "7fc71398-7c45-4e3d-9062-3e483847cc74",
    householdId,
    role: "member" as const,
  };

  it("normalizes the token and returns the new membership", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ membership }, { status: 201 }),
    );

    await expect(
      acceptHouseholdInvite({
        accessToken: "access-token",
        token: `  ${token}  `,
      }),
    ).resolves.toEqual({ kind: "success", membership });

    expect(fetchMock).toHaveBeenCalledWith("/api/households/invites/accept", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
  });

  it.each([
    [401, "unauthorized"],
    [400, "invalid_invite"],
    [409, "already_member"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    await expect(
      acceptHouseholdInvite({ accessToken: "access-token", token }),
    ).resolves.toEqual({ kind });
  });

  it("rejects an invalid token without making a request", async () => {
    await expect(
      acceptHouseholdInvite({
        accessToken: "access-token",
        token: "not-a-token",
      }),
    ).resolves.toEqual({ kind: "invalid_invite" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ membership: { ...membership, role: "owner" } }),
    );

    await expect(
      acceptHouseholdInvite({ accessToken: "access-token", token }),
    ).rejects.toThrow();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      acceptHouseholdInvite({ accessToken: "access-token", token }),
    ).rejects.toThrow("Failed to accept household invite");
  });
});

describe("createHouseholdInvite", () => {
  const invite = {
    id: "74fc10c9-a82d-4126-918c-0d09d1224a32",
    householdId,
    createdAt: "2026-08-10T12:00:00.000Z",
    expiresAt: "2026-08-17T12:00:00.000Z",
    token: "a".repeat(43),
  };

  it("creates and validates a one-time raw invite token", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ invite }, { status: 201 }));

    await expect(
      createHouseholdInvite({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind: "success", invite });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/invites`,
      {
        method: "POST",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    await expect(
      createHouseholdInvite({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind });
  });

  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ invite: { ...invite, token: "too-short" } }),
    );

    await expect(
      createHouseholdInvite({ accessToken: "access-token", householdId }),
    ).rejects.toThrow();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      createHouseholdInvite({ accessToken: "access-token", householdId }),
    ).rejects.toThrow("Failed to create household invite");
  });
});

describe("renameHousehold", () => {
  it("validates and sends the normalized rename command", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ household: { id: householdId, name: "Renamed Home" } }),
    );

    await expect(
      renameHousehold({
        accessToken: "access-token",
        householdId,
        name: "  Renamed Home  ",
      }),
    ).resolves.toEqual({ kind: "success" });

    expect(fetchMock).toHaveBeenCalledWith(`/api/households/${householdId}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed Home" }),
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      renameHousehold({
        accessToken: "access-token",
        householdId,
        name: "Home",
      }),
    ).resolves.toEqual({ kind });
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(
      renameHousehold({
        accessToken: "access-token",
        householdId,
        name: "Home",
      }),
    ).rejects.toThrow("Failed to rename household");
  });

  it("rejects an invalid name before making a request", async () => {
    await expect(
      renameHousehold({
        accessToken: "access-token",
        householdId,
        name: "   ",
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listHouseholdMembers", () => {
  const members = [
    {
      id: "7dbb2304-955a-4d0b-9878-d39a42a38eb2",
      username: "artur",
      role: "owner" as const,
      joinedAt: "2026-08-01T12:00:00.000Z",
    },
  ];

  it("returns a validated member roster", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ members }));

    await expect(
      listHouseholdMembers({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind: "success", members });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/members`,
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      listHouseholdMembers({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind });
  });

  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ members: [{ ...members[0], email: "private@test" }] }),
    );

    await expect(
      listHouseholdMembers({ accessToken: "access-token", householdId }),
    ).rejects.toThrow();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      listHouseholdMembers({ accessToken: "access-token", householdId }),
    ).rejects.toThrow("Failed to list household members");
  });
});

describe("listHouseholdInvites", () => {
  const invites = [
    {
      id: "e467b00a-5f80-4c13-aa5b-d2e59996dd82",
      createdAt: "2026-08-01T12:00:00.000Z",
      expiresAt: "2026-08-08T12:00:00.000Z",
    },
  ];

  it("returns validated pending-invite metadata", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ invites }));

    await expect(
      listHouseholdInvites({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind: "success", invites });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/invites`,
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      listHouseholdInvites({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind });
  });

  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ invites: [{ ...invites[0], tokenHash: "secret" }] }),
    );

    await expect(
      listHouseholdInvites({ accessToken: "access-token", householdId }),
    ).rejects.toThrow();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      listHouseholdInvites({ accessToken: "access-token", householdId }),
    ).rejects.toThrow("Failed to list household invites");
  });
});

describe("revokeHouseholdInvite", () => {
  const inviteId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";

  it("sends an authenticated delete command", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      revokeHouseholdInvite({
        accessToken: "access-token",
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind: "success" });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/invites/${inviteId}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "invalid_invite"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      revokeHouseholdInvite({
        accessToken: "access-token",
        householdId,
        inviteId,
      }),
    ).resolves.toEqual({ kind });
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      revokeHouseholdInvite({
        accessToken: "access-token",
        householdId,
        inviteId,
      }),
    ).rejects.toThrow("Failed to revoke household invite");
  });
});

describe("removeHouseholdMember", () => {
  const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

  it("sends an authenticated delete command", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      removeHouseholdMember({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).resolves.toEqual({ kind: "success" });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/members/${membershipId}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "invalid_member"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      removeHouseholdMember({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).resolves.toEqual({ kind });
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      removeHouseholdMember({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).rejects.toThrow("Failed to remove household member");
  });
});

describe("leaveHousehold", () => {
  it("sends an authenticated delete command", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      leaveHousehold({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind: "success" });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/membership`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "owner_must_transfer"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      leaveHousehold({ accessToken: "access-token", householdId }),
    ).resolves.toEqual({ kind });
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      leaveHousehold({ accessToken: "access-token", householdId }),
    ).rejects.toThrow("Failed to leave household");
  });
});

describe("transferHouseholdOwnership", () => {
  const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

  it("validates and sends the authenticated transfer command", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      transferHouseholdOwnership({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).resolves.toEqual({ kind: "success" });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/ownership`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ membershipId }),
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "invalid_member"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Rejected" }, { status }),
    );

    await expect(
      transferHouseholdOwnership({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).resolves.toEqual({ kind });
  });

  it("rejects an invalid membership id before making a request", async () => {
    await expect(
      transferHouseholdOwnership({
        accessToken: "access-token",
        householdId,
        membershipId: "invalid-member",
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws for an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      transferHouseholdOwnership({
        accessToken: "access-token",
        householdId,
        membershipId,
      }),
    ).rejects.toThrow("Failed to transfer household ownership");
  });
});
