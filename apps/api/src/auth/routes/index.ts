import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../bearer-auth";
import { type CreateLoginRouteInput, createLoginRoute } from "./login";
import { type CreateLogoutRouteInput, createLogoutRoute } from "./logout";
import { type CreateMeRouteInput, createMeRoute } from "./me";
import { type CreateRefreshRouteInput, createRefreshRoute } from "./refresh";
import { type CreateSignupRouteInput, createSignupRoute } from "./signup";

export type CreateAuthRoutesInput = CreateSignupRouteInput &
  CreateLoginRouteInput &
  CreateRefreshRouteInput &
  CreateLogoutRouteInput &
  CreateMeRouteInput & {
    jwtSecret: string;
  };

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono<AuthEnv>();

  authRoutes.post("/signup", createSignupRoute(input));
  authRoutes.post("/login", createLoginRoute(input));
  authRoutes.post("/refresh", createRefreshRoute(input));
  authRoutes.post("/logout", createLogoutRoute(input));
  authRoutes.get(
    "/me",
    createBearerAuth(input.jwtSecret),
    createMeRoute(input),
  );

  return authRoutes;
}
