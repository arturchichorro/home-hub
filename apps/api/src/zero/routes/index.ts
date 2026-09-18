import { Hono } from "hono";
import type { MiddlewareHandler } from "hono/types";

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

  zeroRoutes.post("/query", input.authenticateRequest, createZeroQueryRoute());

  zeroRoutes.post(
    "/mutate",
    input.authenticateRequest,
    createZeroMutateRoute(input),
  );

  return zeroRoutes;
}
