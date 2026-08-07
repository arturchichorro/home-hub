import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renameHousehold } from "./api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const fetchMock = vi.fn<typeof fetch>();

describe("renameHousehold", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
