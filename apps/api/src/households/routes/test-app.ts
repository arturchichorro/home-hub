import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import { createHouseholdRoutes as createRoutes } from "./index";
export function createHouseholdRoutes(
  input: Parameters<typeof createRoutes>[0] & { jwtSecret: string },
) {
  return new Hono<AuthEnv>()
    .use("*", createBearerAuth(input.jwtSecret))
    .route("/", createRoutes(input));
}
