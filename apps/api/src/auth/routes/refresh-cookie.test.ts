import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { setRefreshTokenCookie } from "./refresh-cookie";

function createCookieApp(isProduction: boolean) {
  const app = new Hono();

  app.get("/", (c) => {
    setRefreshTokenCookie(c, "refresh-token", isProduction);
    return c.body(null, 204);
  });

  return app;
}

describe("refresh cookie", () => {
  it("sets an HttpOnly refresh cookie for the auth path", async () => {
    const response = await createCookieApp(false).request("/");
    const cookie = response.headers.get("set-cookie");

    expect(cookie).toContain("home_hub_refresh=refresh-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/auth");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the refresh cookie Secure in production", async () => {
    const response = await createCookieApp(true).request("/");

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
