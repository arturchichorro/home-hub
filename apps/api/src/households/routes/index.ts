import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import { type CreateHouseholdRouteInput, createHouseholdRoute } from "./create";

export type CreateHouseholdRoutesInput = CreateHouseholdRouteInput & {
  jwtSecret: string;
};

export function createHouseholdRoutes(input: CreateHouseholdRoutesInput) {
  const householdRoutes = new Hono<AuthEnv>();

  householdRoutes.post(
    "/",
    createBearerAuth(input.jwtSecret),
    createHouseholdRoute(input),
  );

  return householdRoutes;
}
