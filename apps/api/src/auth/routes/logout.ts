import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import {
  clearRefreshTokenCookie,
  refreshTokenCookieName,
} from "./refresh-cookie";

export type CreateLogoutRouteInput = {
  logout: (rawRefreshToken: string) => Promise<void>;
  isProduction: boolean;
};

export function createLogoutRoute({
  logout,
  isProduction,
}: CreateLogoutRouteInput) {
  return async (c: Context) => {
    const rawRefreshToken = getCookie(c, refreshTokenCookieName);

    if (rawRefreshToken) {
      await logout(rawRefreshToken);
    }

    clearRefreshTokenCookie(c, isProduction);

    return c.body(null, 204);
  };
}
