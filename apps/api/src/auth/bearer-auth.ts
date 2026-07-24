import { createMiddleware } from "hono/factory";

import { verifyAccessToken } from "./access-token";

export type AuthEnv = {
  Variables: {
    userId: string;
  };
};

export function createBearerAuth(jwtSecret: string) {
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
    await next();
  });
}
