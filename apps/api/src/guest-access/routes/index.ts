import { redeemGuestAccessRequestSchema } from "@home-hub/shared/guest-access";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type {
  createLogoutGuestAccessService,
  createRedeemGuestAccessService,
  createRefreshGuestAccessService,
  GuestSessionDetails,
} from "../session";
import {
  clearGuestSessionCookie,
  guestSessionCookieName,
  setGuestSessionCookie,
} from "./cookie";

export type CreateGuestAccessRoutesInput = {
  isProduction: boolean;
  logoutGuestAccess: ReturnType<typeof createLogoutGuestAccessService>;
  redeemGuestAccess: ReturnType<typeof createRedeemGuestAccessService>;
  refreshGuestAccess: ReturnType<typeof createRefreshGuestAccessService>;
};

function publicSession(session: GuestSessionDetails) {
  return {
    accessToken: session.accessToken,
    access: session.access,
    cacheIdentity: session.cacheIdentity,
    household: session.household,
  };
}

export function createGuestAccessRoutes(input: CreateGuestAccessRoutesInput) {
  const routes = new Hono();

  routes.post("/redeem", async (c) => {
    const parsed = redeemGuestAccessRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);

    const result = await input.redeemGuestAccess(parsed.data.token);
    if (result.kind === "invalid_token") {
      clearGuestSessionCookie(c, input.isProduction);
      return c.json({ error: "Guest access is unavailable" }, 401);
    }

    setGuestSessionCookie(c, result.session.sessionToken, input.isProduction);
    return c.json(publicSession(result.session), 200);
  });

  routes.post("/refresh", async (c) => {
    const token = getCookie(c, guestSessionCookieName);
    if (!token) {
      clearGuestSessionCookie(c, input.isProduction);
      return c.json({ error: "Guest access is unavailable" }, 401);
    }

    const result = await input.refreshGuestAccess(token);
    if (result.kind === "invalid_token") {
      clearGuestSessionCookie(c, input.isProduction);
      return c.json({ error: "Guest access is unavailable" }, 401);
    }

    setGuestSessionCookie(c, result.session.sessionToken, input.isProduction);
    return c.json(publicSession(result.session), 200);
  });

  routes.post("/logout", async (c) => {
    const token = getCookie(c, guestSessionCookieName);
    if (token) await input.logoutGuestAccess(token);
    clearGuestSessionCookie(c, input.isProduction);
    return c.body(null, 204);
  });

  return routes;
}
