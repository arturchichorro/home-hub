import type { Database } from "@home-hub/database";
import { Hono } from "hono";

import {
  createAccessPrincipalAuth,
  type PrincipalEnv,
} from "../../authorization/principal";
import {
  type CreateZeroMutateRouteInput,
  createZeroMutateRoute,
} from "./mutate";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = CreateZeroMutateRouteInput & {
  jwtSecret: string;
  principalDatabase?: Database;
};

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<PrincipalEnv>();
  const principalAuth = createAccessPrincipalAuth({
    db: input.principalDatabase ?? ({} as Database),
    jwtSecret: input.jwtSecret,
  });

  zeroRoutes.post("/query", principalAuth, createZeroQueryRoute());

  zeroRoutes.post("/mutate", principalAuth, createZeroMutateRoute(input));

  return zeroRoutes;
}
