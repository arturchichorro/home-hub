import type { Context } from "hono";

import type { AuthEnv } from "../bearer-auth";
import type { MeResult } from "../me";

export type CreateMeRouteInput = {
  getMe: (userId: string) => Promise<MeResult>;
};

export function createMeRoute({ getMe }: CreateMeRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const result = await getMe(c.get("userId"));

    if (result.kind === "not_found") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ user: result.user }, 200);
  };
}
