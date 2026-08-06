import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type CreateZeroMutateRouteInput,
  createZeroMutateRoute,
} from "./mutate";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = CreateZeroMutateRouteInput & {
  jwtSecret: string;
};

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<AuthEnv>();

  zeroRoutes.post(
    "/query",
    createBearerAuth(input.jwtSecret),
    createZeroQueryRoute(),
  );

  zeroRoutes.post(
    "/mutate",
    createBearerAuth(input.jwtSecret),
    createZeroMutateRoute(input),
  );

  return zeroRoutes;
}
