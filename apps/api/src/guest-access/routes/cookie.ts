import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const guestSessionCookieName = "home_hub_guest";
const guestSessionMaxAgeSeconds = 400 * 24 * 60 * 60;

export function setGuestSessionCookie(
  c: Context,
  token: string,
  isProduction: boolean,
) {
  setCookie(c, guestSessionCookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/api/guest",
    secure: isProduction,
    maxAge: guestSessionMaxAgeSeconds,
  });
}

export function clearGuestSessionCookie(c: Context, isProduction: boolean) {
  deleteCookie(c, guestSessionCookieName, {
    path: "/api/guest",
    secure: isProduction,
  });
}
