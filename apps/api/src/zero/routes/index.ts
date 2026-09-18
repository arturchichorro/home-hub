import { Hono, type MiddlewareHandler } from "hono";

import type { RequestAccessEnv } from "../../authorization/request-access";
import {
  type CreateZeroMutateRouteInput,
  createZeroMutateRoute,
} from "./mutate";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = CreateZeroMutateRouteInput & {
  authenticateRequest: MiddlewareHandler<RequestAccessEnv>;
};

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<RequestAccessEnv>();
  zeroRoutes.use("*", input.authenticateRequest);

  zeroRoutes.post("/query", createZeroQueryRoute());

  zeroRoutes.post("/mutate", createZeroMutateRoute(input));

  return zeroRoutes;
}
