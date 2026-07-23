import { type SignupRequest, signupRequestSchema } from "@home-hub/shared/auth";
import type { Context } from "hono";

import type { SignupResult } from "../signup";
import { setRefreshTokenCookie } from "./refresh-cookie";

export type CreateSignupRouteInput = {
  signup: (request: SignupRequest) => Promise<SignupResult>;
  isProduction: boolean;
};

export function createSignupRoute({
  signup,
  isProduction,
}: CreateSignupRouteInput) {
  return async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = signupRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await signup(parsed.data);

    if (result.kind === "forbidden") {
      return c.json({ error: "Signup unavailable" }, 403);
    }

    if (result.kind === "conflict") {
      return c.json({ error: "Username or email already exists" }, 409);
    }

    setRefreshTokenCookie(c, result.refreshToken, isProduction);

    return c.json(
      {
        user: result.user,
        accessToken: result.accessToken,
      },
      201,
    );
  };
}
