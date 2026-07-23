import type { LoginRequest, SignupRequest } from "@home-hub/shared/auth";
import { describe, expect, it } from "vitest";

import type { LoginResult } from "../login";
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

function createTestAuthRoutes(input: {
  signup?: (request: SignupRequest) => Promise<SignupResult>;
  login?: (request: LoginRequest) => Promise<LoginResult>;
  isProduction?: boolean;
}) {
  return createAuthRoutes({
    signup: input.signup ?? (async () => ({ kind: "forbidden" })),
    login: input.login ?? (async () => ({ kind: "invalid_credentials" })),
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
});
