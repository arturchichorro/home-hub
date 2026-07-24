import { Hono } from "hono";

import { type CreateLoginRouteInput, createLoginRoute } from "./login";
import { type CreateLogoutRouteInput, createLogoutRoute } from "./logout";
import { type CreateRefreshRouteInput, createRefreshRoute } from "./refresh";
import { type CreateSignupRouteInput, createSignupRoute } from "./signup";

export type CreateAuthRoutesInput = CreateSignupRouteInput &
  CreateLoginRouteInput &
  CreateRefreshRouteInput &
  CreateLogoutRouteInput;

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono();

  authRoutes.post("/signup", createSignupRoute(input));
  authRoutes.post("/login", createLoginRoute(input));
  authRoutes.post("/refresh", createRefreshRoute(input));
  authRoutes.post("/logout", createLogoutRoute(input));

  return authRoutes;
}
