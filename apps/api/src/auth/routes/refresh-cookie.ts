import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const refreshTokenCookieName = "home_hub_refresh";
const refreshTokenMaxAgeSeconds = 30 * 24 * 60 * 60;

export function setRefreshTokenCookie(
  c: Context,
  refreshToken: string,
  isProduction: boolean,
) {
  setCookie(c, refreshTokenCookieName, refreshToken, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/api/auth",
    secure: isProduction,
    maxAge: refreshTokenMaxAgeSeconds,
  });
}

export function clearRefreshTokenCookie(c: Context, isProduction: boolean) {
  deleteCookie(c, refreshTokenCookieName, {
    path: "/api/auth",
    secure: isProduction,
  });
}
