import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import { type CreateHouseholdRouteInput, createHouseholdRoute } from "./create";
import {
  type CreateListHouseholdsRouteInput,
  createListHouseholdsRoute,
} from "./list";

export type CreateHouseholdRoutesInput = CreateHouseholdRouteInput &
  CreateListHouseholdsRouteInput & {
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

  return householdRoutes;
}
