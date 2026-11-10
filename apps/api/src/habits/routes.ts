import { habitStatsRequestSchema } from "@home-hub/shared/habit-stats";
import { Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import type { HabitStatsService } from "./stats";

export function createHabitStatsRoutes({
  jwtSecret,
  stats,
}: {
  jwtSecret: string;
  stats: HabitStatsService;
}) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", createBearerAuth(jwtSecret));
  routes.get("/:habitId/stats", async (c) => {
    c.header("Cache-Control", "no-store");
    const path = z
      .object({ householdId: z.uuid(), habitId: z.uuid() })
      .safeParse(c.req.param());
    const query = habitStatsRequestSchema.safeParse(c.req.query());
    if (!path.success || !query.success) {
      return c.json({ error: "Invalid request" }, 400);
    }
    const result = await stats({
      ...path.data,
      ...query.data,
      userId: c.get("userId"),
    });
    if (result.kind === "success") {
      return c.json(result.stats);
    }
    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }
    return c.json({ error: "Not found" }, 404);
  });
  return routes;
}
