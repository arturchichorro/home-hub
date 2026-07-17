import type { SignupRequest } from "@home-hub/shared/auth";
import { describe, expect, it } from "vitest";

import { createAuthRoutes } from "./routes";
import type { SignupResult } from "./signup";

const validSignupRequest = {
  username: "  Artur   Chichorro  ",
  email: "  ARTUR@EXAMPLE.COM  ",
  password: "a password with spaces",
  accessCode: "  household-code  ",
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

function createTestAuthRoutes(input: {
  signup: (request: SignupRequest) => Promise<SignupResult>;
  isProduction?: boolean;
}) {
  return createAuthRoutes({
    signup: input.signup,
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
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/auth");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the refresh cookie secure in production", async () => {
    const app = createTestAuthRoutes({
      signup: async () => successfulSignup,
      isProduction: true,
    });

    const response = await postSignup(app, JSON.stringify(validSignupRequest));

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
