import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type AcceptHouseholdInviteRouteInput,
  createAcceptHouseholdInviteRoute,
} from "./accept-invite";
import { type CreateHouseholdRouteInput, createHouseholdRoute } from "./create";
import {
  type CreateHouseholdInviteRouteInput,
  createHouseholdInviteRoute,
} from "./create-invite";
import {
  type CreateListHouseholdsRouteInput,
  createListHouseholdsRoute,
} from "./list";
import {
  createRenameHouseholdRoute,
  type RenameHouseholdRouteInput,
} from "./rename";

export type CreateHouseholdRoutesInput = AcceptHouseholdInviteRouteInput &
  CreateHouseholdRouteInput &
  CreateHouseholdInviteRouteInput &
  CreateListHouseholdsRouteInput &
  RenameHouseholdRouteInput & {
    jwtSecret: string;
  };

export function createHouseholdRoutes(input: CreateHouseholdRoutesInput) {
  const householdRoutes = new Hono<AuthEnv>();

  householdRoutes.post(
    "/",
    createBearerAuth(input.jwtSecret),
    createHouseholdRoute(input),
  );
  householdRoutes.get(
    "/",
    createBearerAuth(input.jwtSecret),
    createListHouseholdsRoute(input),
  );
  householdRoutes.post(
    "/:householdId/invites",
    createBearerAuth(input.jwtSecret),
    createHouseholdInviteRoute(input),
  );
  householdRoutes.post(
    "/invites/accept",
    createBearerAuth(input.jwtSecret),
    createAcceptHouseholdInviteRoute(input),
  );
  householdRoutes.patch(
    "/:householdId",
    createBearerAuth(input.jwtSecret),
    createRenameHouseholdRoute(input),
  );

  return householdRoutes;
}
