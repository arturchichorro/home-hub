import { Hono } from "hono";

import { type CreateLoginRouteInput, createLoginRoute } from "./login";
import { type CreateRefreshRouteInput, createRefreshRoute } from "./refresh";
import { type CreateSignupRouteInput, createSignupRoute } from "./signup";

export type CreateAuthRoutesInput = CreateSignupRouteInput &
  CreateLoginRouteInput &
  CreateRefreshRouteInput;

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono();

  authRoutes.post("/signup", createSignupRoute(input));
  authRoutes.post("/login", createLoginRoute(input));
  authRoutes.post("/refresh", createRefreshRoute(input));

  return authRoutes;
}
