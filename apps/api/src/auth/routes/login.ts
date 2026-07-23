import { type LoginRequest, loginRequestSchema } from "@home-hub/shared/auth";
import type { Context } from "hono";

import type { LoginResult } from "../login";
import { setRefreshTokenCookie } from "./refresh-cookie";

export type CreateLoginRouteInput = {
  login: (request: LoginRequest) => Promise<LoginResult>;
  isProduction: boolean;
};

export function createLoginRoute({
  login,
  isProduction,
}: CreateLoginRouteInput) {
  return async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = loginRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await login(parsed.data);

    if (result.kind === "invalid_credentials") {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    setRefreshTokenCookie(c, result.refreshToken, isProduction);

    return c.json(
      {
        user: result.user,
        accessToken: result.accessToken,
      },
      200,
    );
  };
}
