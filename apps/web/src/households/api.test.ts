import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptHouseholdInvite, createHouseholdInvite } from "./api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

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
