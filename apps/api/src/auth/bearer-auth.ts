import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { createMiddleware } from "hono/factory";
import type { createValidateGuestCredential } from "../guest-access/credential";

import { verifyAccessToken } from "./access-token";

export type AuthEnv = {
  Variables: {
    requestStartedAt: number;
    userId: string;
    principal: ZeroAuthContext;
  };
};

export function createBearerAuth(
  jwtSecret: string,
  validateGuest?: ReturnType<typeof createValidateGuestCredential>,
) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authorization = c.req.header("Authorization");
    const parts = authorization?.trim().split(/\s+/);

    if (
      parts?.length !== 2 ||
      parts[0]?.toLowerCase() !== "bearer" ||
      !parts[1]
    ) {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (parts[1].startsWith("hhg_v1_")) {
      const guest = await validateGuest?.(parts[1]);
      if (!guest) {
        c.header("WWW-Authenticate", "Bearer");
        return c.json({ error: "Unauthorized" }, 401);
      }
      c.set("principal", {
        guest: { ...guest, expiresAt: guest.expiresAt.getTime() },
      });
      await next();
      return;
    }
    let userId: string;

    try {
      userId = verifyAccessToken({
        token: parts[1],
        secret: jwtSecret,
      }).sub;
    } catch {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", userId);
    c.set("principal", { userId });
    await next();
  });
}

export const requireAccount = createMiddleware<AuthEnv>(async (c, next) => {
  if (!c.get("principal") || c.get("principal").guest)
    return c.json({ error: "Forbidden" }, 403);
  await next();
});
