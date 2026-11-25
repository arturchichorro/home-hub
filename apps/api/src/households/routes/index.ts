import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type AcceptHouseholdInviteRouteInput,
  createAcceptHouseholdInviteRoute,
} from "./accept-invite";
import {
  type CreateHouseholdInviteRouteInput,
  createHouseholdInviteRoute,
} from "./create-invite";

export type CreateHouseholdRoutesInput = AcceptHouseholdInviteRouteInput &
  CreateHouseholdInviteRouteInput & { jwtSecret: string };

// Only plaintext secret exchange belongs outside Zero. Household records,
// membership changes and invitation metadata use Zero queries/custom mutators.
export function createHouseholdRoutes(input: CreateHouseholdRoutesInput) {
  const routes = new Hono<AuthEnv>();
  routes.post(
    "/:householdId/invites",
    createBearerAuth(input.jwtSecret),
    createHouseholdInviteRoute(input),
  );
  routes.post(
    "/invites/accept",
    createBearerAuth(input.jwtSecret),
    createAcceptHouseholdInviteRoute(input),
  );
  return routes;
}
