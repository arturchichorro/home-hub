import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import { createZeroQueryRoute } from "./query";

export type CreateZeroRoutesInput = {
  jwtSecret: string;
};

export function createZeroRoutes(input: CreateZeroRoutesInput) {
  const zeroRoutes = new Hono<AuthEnv>();

  zeroRoutes.post(
    "/query",
    createBearerAuth(input.jwtSecret),
    createZeroQueryRoute(),
  );

  return zeroRoutes;
}
