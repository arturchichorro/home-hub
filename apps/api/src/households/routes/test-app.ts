import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import { createHouseholdRoutes as createRoutes } from "./index";
// Route tests mount this small authenticated app. Production installs the same
// middleware once in createApp; the feature router itself has no JWT configuration.
export function createHouseholdRoutes(
  input: Parameters<typeof createRoutes>[0] & { jwtSecret: string },
) {
  return new Hono<AuthEnv>()
    .use("*", createBearerAuth(input.jwtSecret))
    .route("/", createRoutes(input));
}
