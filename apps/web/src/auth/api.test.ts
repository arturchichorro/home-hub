import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { login, logout, restoreSession, signup } from "./api";

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

describe("login", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes credentials and returns the authenticated session", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ user, accessToken: "access-token" }),
    );

    await expect(
      login({
        email: "  ARTUR@EXAMPLE.COM  ",
        password: "  password with spaces  ",
      }),
    ).resolves.toEqual({
      kind: "success",
      session: { user, accessToken: "access-token" },
    });

    expect(fetchMock).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "artur@example.com",
        password: "  password with spaces  ",
      }),
    });
  });

  it("reports invalid credentials without exposing server details", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Invalid credentials" }, { status: 401 }),
    );

    await expect(
      login({ email: "artur@example.com", password: "wrong" }),
    ).resolves.toEqual({ kind: "invalid_credentials" });
  });

  it("throws when login fails unexpectedly", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(
      login({ email: "artur@example.com", password: "password" }),
    ).rejects.toThrow("Failed to login");
  });

  it("rejects malformed login response data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        user: { ...user, id: "not-a-uuid" },
        accessToken: "access-token",
      }),
    );

    await expect(
      login({ email: "artur@example.com", password: "password" }),
    ).rejects.toThrow();
  });

  it("rejects invalid credentials before making a request", async () => {
    await expect(
      login({ email: "not-an-email", password: "password" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("signup", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request = {
    username: "  artur  ",
    email: "  ARTUR@EXAMPLE.COM  ",
    password: "a secure password",
    accessCode: "  household-code  ",
  };

  it("normalizes the request and returns the authenticated session", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ user, accessToken: "access-token" }, { status: 201 }),
    );

    await expect(signup(request)).resolves.toEqual({
      kind: "success",
      session: { user, accessToken: "access-token" },
    });

    expect(fetchMock).toHaveBeenCalledWith("/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "artur",
        email: "artur@example.com",
        password: "a secure password",
        accessCode: "household-code",
      }),
    });
  });

  it("reports when sign up is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Signup unavailable" }, { status: 403 }),
    );

    await expect(signup(request)).resolves.toEqual({ kind: "forbidden" });
  });

  it("reports an existing username or email", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Already exists" }, { status: 409 }),
    );

    await expect(signup(request)).resolves.toEqual({ kind: "conflict" });
  });

  it("throws on an unexpected server failure", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(signup(request)).rejects.toThrow("Failed to sign up");
  });

  it("rejects invalid input before making a request", async () => {
    await expect(
      signup({ ...request, password: "too short" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed success response data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          user: { ...user, id: "not-a-uuid" },
          accessToken: "access-token",
        },
        { status: 201 },
      ),
    );

    await expect(signup(request)).rejects.toThrow();
  });
});

describe("logout", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs out the refresh-cookie session", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  it("throws when the server cannot complete logout", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(logout()).rejects.toThrow("Failed to log out");
  });
});
