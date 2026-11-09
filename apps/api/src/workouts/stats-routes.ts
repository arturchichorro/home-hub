import { Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import type { ExerciseStatsService } from "./exercise-stats";

export function createExerciseStatsRoutes({
  jwtSecret,
  stats,
}: {
  jwtSecret: string;
  stats: ExerciseStatsService;
}) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", createBearerAuth(jwtSecret));
  routes.get("/:exerciseId/stats", async (c) => {
    c.header("Cache-Control", "no-store");
    const scope = z
      .object({ householdId: z.uuid(), exerciseId: z.uuid() })
      .safeParse(c.req.param());
    if (!scope.success) {
      return c.json({ error: "Invalid request" }, 400);
    }
    const result = await stats({ ...scope.data, userId: c.get("userId") });
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
