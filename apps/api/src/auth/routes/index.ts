import { Hono } from "hono";

import { type CreateLoginRouteInput, createLoginRoute } from "./login";
import { type CreateSignupRouteInput, createSignupRoute } from "./signup";

export type CreateAuthRoutesInput = CreateSignupRouteInput &
  CreateLoginRouteInput;

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono();

  authRoutes.post("/signup", createSignupRoute(input));
  authRoutes.post("/login", createLoginRoute(input));

  return authRoutes;
}
