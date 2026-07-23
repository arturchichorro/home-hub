import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import type { RefreshResult } from "../refresh";
import {
  clearRefreshTokenCookie,
  refreshTokenCookieName,
  setRefreshTokenCookie,
} from "./refresh-cookie";

export type CreateRefreshRouteInput = {
  refresh: (rawRefreshToken: string) => Promise<RefreshResult>;
  isProduction: boolean;
};

export function createRefreshRoute({
  refresh,
  isProduction,
}: CreateRefreshRouteInput) {
  return async (c: Context) => {
    const rawRefreshToken = getCookie(c, refreshTokenCookieName);

    if (!rawRefreshToken) {
      clearRefreshTokenCookie(c, isProduction);
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    const result = await refresh(rawRefreshToken);

    if (result.kind === "invalid_token") {
      clearRefreshTokenCookie(c, isProduction);
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    setRefreshTokenCookie(c, result.refreshToken, isProduction);

    return c.json({ accessToken: result.accessToken }, 200);
  };
}
