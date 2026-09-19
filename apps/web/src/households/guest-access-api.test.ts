import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGuestAccessLink,
  regenerateGuestAccessLink,
  updateGuestAccessLink,
} from "./guest-access-api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const linkId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const token = "a".repeat(43);
const link = {
  id: linkId,
  householdId,
  name: "Kitchen QR",
  access: "write" as const,
  expiresAt: "2026-12-17T12:00:00.000Z",
  disabledAt: null,
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("Guest access link API", () => {
  it("creates a named write link and returns its one-time token", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ link: { ...link, token } }, { status: 201 }),
    );

    await expect(
      createGuestAccessLink({
        accessToken: "account-token",
        householdId,
        name: " Kitchen QR ",
        access: "write",
      }),
    ).resolves.toEqual({
      kind: "success",
      link: { ...link, token },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/guest-access-links`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Kitchen QR", access: "write" }),
      }),
    );
  });

  it("sends only the requested access-level change", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ link: { ...link, access: "read" } }),
    );
    await updateGuestAccessLink({
      accessToken: "account-token",
      householdId,
      linkId,
      access: "read",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/guest-access-links/${linkId}`,
      expect.objectContaining({ body: JSON.stringify({ access: "read" }) }),
    );
  });

  it("sends an explicit expiration when requested", async () => {
    const expiresAt = "2027-01-01T00:00:00.000Z";
    fetchMock.mockResolvedValueOnce(
      Response.json({ link: { ...link, expiresAt } }),
    );

    await updateGuestAccessLink({
      accessToken: "account-token",
      householdId,
      linkId,
      expiresAt,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/guest-access-links/${linkId}`,
      expect.objectContaining({ body: JSON.stringify({ expiresAt }) }),
    );
  });

  it("uses the explicit regeneration endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ link: { ...link, token } }),
    );
    await regenerateGuestAccessLink({
      accessToken: "account-token",
      householdId,
      linkId,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/guest-access-links/${linkId}/regenerate`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
  ] as const)("maps owner authorization failure %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(
      regenerateGuestAccessLink({
        accessToken: "account-token",
        householdId,
        linkId,
      }),
    ).resolves.toEqual({ kind });
  });
});
