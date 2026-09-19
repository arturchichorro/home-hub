import { Hono } from "hono";
import type { RequestAccessEnv } from "../../authorization/request-access";
import type { createGuestAccessContextService } from "../context";

export type CreateGuestAccessRoutesInput = {
  getGuestAccessContext: ReturnType<typeof createGuestAccessContextService>;
};

export function createGuestAccessRoutes(input: CreateGuestAccessRoutesInput) {
  const routes = new Hono<RequestAccessEnv>();
  routes.get("/context", async (c) => {
    const result = await input.getGuestAccessContext(c.get("requestAccess"));
    if (result.kind === "unavailable") {
      c.header("WWW-Authenticate", "Guest");
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json(result.context, 200);
  });
  return routes;
}
