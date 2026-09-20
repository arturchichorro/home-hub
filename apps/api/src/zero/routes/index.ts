import { Hono } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";
import {
  type CreateZeroMutateRouteInput,
  createZeroMutateRoute,
} from "./mutate";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = CreateZeroMutateRouteInput;

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<AuthEnv>();

  zeroRoutes.post(
    "/query",

    createZeroQueryRoute(),
  );

  zeroRoutes.post(
    "/mutate",

    createZeroMutateRoute(input),
  );

  return zeroRoutes;
}
