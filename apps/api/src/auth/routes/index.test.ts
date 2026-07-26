import type { LoginRequest, SignupRequest } from "@home-hub/shared/auth";
import { describe, expect, it } from "vitest";

import { signAccessToken } from "../access-token";
import type { LoginResult } from "../login";
import type { MeResult } from "../me";
import type { RefreshResult } from "../refresh";
import type { SignupResult } from "../signup";
import { createAuthRoutes } from "./index";

const validSignupRequest = {
  username: "  Artur   Chichorro  ",
  email: "  ARTUR@EXAMPLE.COM  ",
  password: "a password with spaces",
  accessCode: "  household-code  ",
};

const validLoginRequest = {
  email: "  ARTUR@EXAMPLE.COM  ",
  password: "a password with spaces",
};

const successfulSignup: SignupResult = {
  kind: "success",
  user: {
    id: "user-123",
    username: "artur chichorro",
    email: "artur@example.com",
  },
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

const successfulLogin: LoginResult = {
  kind: "success",
  user: {
    id: "user-123",
    username: "artur chichorro",
    email: "artur@example.com",
  },
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

const successfulRefresh: RefreshResult = {
  kind: "success",
  accessToken: "replacement-access-token",
  refreshToken: "replacement-refresh-token",
};

const jwtSecret = "test-jwt-secret";
const authenticatedUser = {
  id: "user-123",
  username: "artur chichorro",
  email: "artur@example.com",
};

function createTestAuthRoutes(input: {
  signup?: (request: SignupRequest) => Promise<SignupResult>;
  login?: (request: LoginRequest) => Promise<LoginResult>;
  refresh?: (rawRefreshToken: string) => Promise<RefreshResult>;
  logout?: (rawRefreshToken: string) => Promise<void>;
  getMe?: (userId: string) => Promise<MeResult>;
  isProduction?: boolean;
}) {
  return createAuthRoutes({
    signup: input.signup ?? (async () => ({ kind: "forbidden" })),
    login: input.login ?? (async () => ({ kind: "invalid_credentials" })),
    refresh: input.refresh ?? (async () => ({ kind: "invalid_token" })),
    logout: input.logout ?? (async () => undefined),
    getMe: input.getMe ?? (async () => ({ kind: "not_found" })),
    jwtSecret,
    isProduction: input.isProduction ?? false,
  });
}

function postSignup(app: ReturnType<typeof createAuthRoutes>, body: string) {
  return app.request("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function postLogin(app: ReturnType<typeof createAuthRoutes>, body: string) {
  return app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function postRefresh(
  app: ReturnType<typeof createAuthRoutes>,
  refreshToken?: string,
) {
  return app.request("/refresh", {
    method: "POST",
    ...(refreshToken
      ? { headers: { Cookie: `home_hub_refresh=${refreshToken}` } }
      : {}),
  });
}

function postLogout(
  app: ReturnType<typeof createAuthRoutes>,
  refreshToken?: string,
) {
  return app.request("/logout", {
    method: "POST",
    ...(refreshToken
      ? { headers: { Cookie: `home_hub_refresh=${refreshToken}` } }
      : {}),
  });
}

function getMe(app: ReturnType<typeof createAuthRoutes>, accessToken?: string) {
  return app.request("/me", {
    ...(accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {}),
  });
}

describe("auth routes", () => {
  it("rejects malformed JSON without invoking signup", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      signup: async () => {
        wasInvoked = true;
        return { kind: "forbidden" };
      },
    });

    const response = await postSignup(app, "{");

    expect(response.status).toBe(400);
    expect(wasInvoked).toBe(false);
  });

  it("rejects an invalid signup request without invoking signup", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      signup: async () => {
        wasInvoked = true;
        return { kind: "forbidden" };
      },
    });

    const response = await postSignup(
      app,
      JSON.stringify({ ...validSignupRequest, unexpected: "value" }),
    );

    expect(response.status).toBe(400);
    expect(wasInvoked).toBe(false);
  });

  it("returns a generic forbidden response when signup is unavailable", async () => {
    const app = createTestAuthRoutes({
      signup: async () => ({ kind: "forbidden" }),
    });

    const response = await postSignup(app, JSON.stringify(validSignupRequest));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Signup unavailable",
    });
  });

  it("returns a conflict response for a duplicate username or email", async () => {
    const app = createTestAuthRoutes({
      signup: async () => ({ kind: "conflict" }),
    });

    const response = await postSignup(app, JSON.stringify(validSignupRequest));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Username or email already exists",
    });
  });

  it("returns the access token and user while keeping the refresh token in a development cookie", async () => {
    let receivedRequest: unknown;
    const app = createTestAuthRoutes({
      signup: async (request) => {
        receivedRequest = request;
        return successfulSignup;
      },
    });

    const response = await postSignup(app, JSON.stringify(validSignupRequest));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: successfulSignup.user,
      accessToken: successfulSignup.accessToken,
    });
    expect(receivedRequest).toEqual({
      username: "artur chichorro",
      email: "artur@example.com",
      password: "a password with spaces",
      accessCode: "household-code",
    });

    const cookie = response.headers.get("set-cookie");

    expect(cookie).toContain("home_hub_refresh=refresh-token");
  });

  it("rejects malformed JSON without invoking login", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      login: async () => {
        wasInvoked = true;
        return { kind: "invalid_credentials" };
      },
    });

    const response = await postLogin(app, "{");

    expect(response.status).toBe(400);
    expect(wasInvoked).toBe(false);
  });

  it("rejects an invalid login request without invoking login", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      login: async () => {
        wasInvoked = true;
        return { kind: "invalid_credentials" };
      },
    });

    const response = await postLogin(
      app,
      JSON.stringify({ ...validLoginRequest, unexpected: "value" }),
    );

    expect(response.status).toBe(400);
    expect(wasInvoked).toBe(false);
  });

  it("returns a generic unauthorized response for invalid credentials", async () => {
    const app = createTestAuthRoutes({
      login: async () => ({ kind: "invalid_credentials" }),
    });

    const response = await postLogin(app, JSON.stringify(validLoginRequest));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid credentials",
    });
  });

  it("returns the access token and user with a refresh cookie on successful login", async () => {
    let receivedRequest: unknown;
    const app = createTestAuthRoutes({
      login: async (request) => {
        receivedRequest = request;
        return successfulLogin;
      },
    });

    const response = await postLogin(app, JSON.stringify(validLoginRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: successfulLogin.user,
      accessToken: successfulLogin.accessToken,
    });
    expect(receivedRequest).toEqual({
      email: "artur@example.com",
      password: "a password with spaces",
    });

    const cookie = response.headers.get("set-cookie");

    expect(cookie).toContain("home_hub_refresh=refresh-token");
  });

  it("rejects a missing refresh cookie without invoking refresh", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      refresh: async () => {
        wasInvoked = true;
        return { kind: "invalid_token" };
      },
    });

    const response = await postRefresh(app);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid refresh token",
    });
    expect(wasInvoked).toBe(false);
    expect(response.headers.get("set-cookie")).toContain("home_hub_refresh=;");
  });

  it("clears the cookie and returns a generic response for an invalid refresh token", async () => {
    let receivedRefreshToken: string | undefined;
    const app = createTestAuthRoutes({
      refresh: async (rawRefreshToken) => {
        receivedRefreshToken = rawRefreshToken;
        return { kind: "invalid_token" };
      },
    });

    const response = await postRefresh(app, "invalid-refresh-token");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid refresh token",
    });
    expect(receivedRefreshToken).toBe("invalid-refresh-token");
    expect(response.headers.get("set-cookie")).toContain("home_hub_refresh=;");
  });

  it("returns a new access token and replaces the refresh cookie", async () => {
    let receivedRefreshToken: string | undefined;
    const app = createTestAuthRoutes({
      refresh: async (rawRefreshToken) => {
        receivedRefreshToken = rawRefreshToken;
        return successfulRefresh;
      },
    });

    const response = await postRefresh(app, "current-refresh-token");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: successfulRefresh.accessToken,
    });
    expect(receivedRefreshToken).toBe("current-refresh-token");
    expect(response.headers.get("set-cookie")).toContain(
      "home_hub_refresh=replacement-refresh-token",
    );
  });

  it("clears the cookie and succeeds when logout has no refresh token", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      logout: async () => {
        wasInvoked = true;
      },
    });

    const response = await postLogout(app);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(wasInvoked).toBe(false);
    expect(response.headers.get("set-cookie")).toContain("home_hub_refresh=;");
  });

  it("revokes the presented session and clears its cookie", async () => {
    let receivedRefreshToken: string | undefined;
    const app = createTestAuthRoutes({
      logout: async (rawRefreshToken) => {
        receivedRefreshToken = rawRefreshToken;
      },
    });

    const response = await postLogout(app, "current-refresh-token");

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(receivedRefreshToken).toBe("current-refresh-token");
    expect(response.headers.get("set-cookie")).toContain("home_hub_refresh=;");
  });

  it("protects the current-user route with bearer authentication", async () => {
    let wasInvoked = false;
    const app = createTestAuthRoutes({
      getMe: async () => {
        wasInvoked = true;
        return { kind: "not_found" };
      },
    });

    const response = await getMe(app);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(wasInvoked).toBe(false);
  });

  it("passes the verified JWT subject to the current-user service", async () => {
    let receivedUserId: string | undefined;
    const app = createTestAuthRoutes({
      getMe: async (userId) => {
        receivedUserId = userId;
        return { kind: "success", user: authenticatedUser };
      },
    });
    const accessToken = signAccessToken({
      userId: authenticatedUser.id,
      jwtId: "jwt-123",
      secret: jwtSecret,
    });

    const response = await getMe(app, accessToken);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: authenticatedUser,
    });
    expect(receivedUserId).toBe(authenticatedUser.id);
  });

  it("returns unauthorized when the JWT subject no longer exists", async () => {
    const app = createTestAuthRoutes({
      getMe: async () => ({ kind: "not_found" }),
    });
    const accessToken = signAccessToken({
      userId: authenticatedUser.id,
      jwtId: "jwt-123",
      secret: jwtSecret,
    });

    const response = await getMe(app, accessToken);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });
});
