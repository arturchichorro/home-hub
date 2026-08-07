import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listHouseholdInvites,
  listHouseholdMembers,
  renameHousehold,
} from "./api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
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

    expect(fetchMock).toHaveBeenCalledWith(`/households/${householdId}`, {
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
      `/households/${householdId}/members`,
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
      `/households/${householdId}/invites`,
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
