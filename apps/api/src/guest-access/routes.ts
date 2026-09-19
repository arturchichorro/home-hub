import { Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import type { GuestLinkService } from "./service";

const creation = z.strictObject({
  name: z.string().trim().min(1).max(100),
  access: z.enum(["read", "write"]),
  expiresAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
});
export function createGuestLinkRoutes({
  service,
  jwtSecret,
}: {
  service: GuestLinkService;
  jwtSecret: string;
}) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", createBearerAuth(jwtSecret));
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!z.uuid().safeParse(c.req.param("householdId")).success)
      return c.json({ error: "Invalid request" }, 400);
    await next();
  });
  routes.post("/", async (c) => {
    const parsed = creation.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
    const result = await service.create({
      ...parsed.data,
      userId: c.get("userId"),
      householdId: z.uuid().parse(c.req.param("householdId")),
    });
    if (result.kind === "unauthorized")
      return c.json({ error: "Unauthorized" }, 401);
    if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
    if (result.kind === "invalid")
      return c.json({ error: "Invalid request" }, 400);
    return c.json({ link: result.link, credential: result.credential }, 201);
  });
  routes.get("/", async (c) => {
    const result = await service.list({
      userId: c.get("userId"),
      householdId: z.uuid().parse(c.req.param("householdId")),
    });
    if (result.kind === "unauthorized")
      return c.json({ error: "Unauthorized" }, 401);
    if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
    return c.json({ links: result.links });
  });
  routes.delete("/:linkId", async (c) => {
    const parsed = z.uuid().safeParse(c.req.param("linkId"));
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
    const result = await service.disable({
      userId: c.get("userId"),
      householdId: z.uuid().parse(c.req.param("householdId")),
      linkId: parsed.data,
    });
    if (result.kind === "unauthorized")
      return c.json({ error: "Unauthorized" }, 401);
    if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
    if (result.kind === "not_found") return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  });
  return routes;
}
