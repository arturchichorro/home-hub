import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreSession } from "./api";

const user = {
  id: "9f8a6942-f721-499d-957d-7bb3ed1158db",
  username: "artur",
  email: "artur@example.com",
};

const fetchMock = vi.fn<typeof fetch>();

describe("restoreSession", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when there is no valid refresh session", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Invalid refresh token" }, { status: 401 }),
    );

    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  });

  it("reconstructs a session from refresh and current-user responses", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ accessToken: "access-token" }))
      .mockResolvedValueOnce(Response.json({ user }));

    await expect(restoreSession()).resolves.toEqual({
      user,
      accessToken: "access-token",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/auth/me", {
      headers: {
        Authorization: "Bearer access-token",
      },
    });
  });

  it("throws when refresh fails unexpectedly", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(restoreSession()).rejects.toThrow("Failed to refresh session");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects malformed refresh response data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ accessToken: "" }));

    await expect(restoreSession()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns null when the refreshed token has no current user", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ accessToken: "access-token" }))
      .mockResolvedValueOnce(
        Response.json({ error: "Unauthorized" }, { status: 401 }),
      );

    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed current-user response data", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ accessToken: "access-token" }))
      .mockResolvedValueOnce(
        Response.json({ user: { ...user, id: "not-a-uuid" } }),
      );

    await expect(restoreSession()).rejects.toThrow();
  });
});
