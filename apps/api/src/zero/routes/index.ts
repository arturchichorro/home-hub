import { Hono } from "hono";

import type { RequestAccessEnv } from "../../authorization/request-access";
import {
  type CreateZeroMutateRouteInput,
  createZeroMutateRoute,
} from "./mutate";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = CreateZeroMutateRouteInput;

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<RequestAccessEnv>();

  zeroRoutes.post("/query", createZeroQueryRoute());

  zeroRoutes.post("/mutate", createZeroMutateRoute(input));

  return zeroRoutes;
}
