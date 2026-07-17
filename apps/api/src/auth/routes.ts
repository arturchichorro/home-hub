import { Hono } from "hono";

import { type CreateSignupRouteInput, createSignupRoute } from "./signup-route";

export type CreateAuthRoutesInput = CreateSignupRouteInput;

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono();

  authRoutes.post("/signup", createSignupRoute(input));

  return authRoutes;
}
