import { Hono } from "hono";

import { type AuthEnv, requireAccount } from "../bearer-auth";
import { type CreateLoginRouteInput, createLoginRoute } from "./login";
import { type CreateLogoutRouteInput, createLogoutRoute } from "./logout";
import { type CreateMeRouteInput, createMeRoute } from "./me";
import { type CreateRefreshRouteInput, createRefreshRoute } from "./refresh";
import { type CreateSignupRouteInput, createSignupRoute } from "./signup";

export type CreateAuthRoutesInput = CreateSignupRouteInput &
  CreateLoginRouteInput &
  CreateRefreshRouteInput &
  CreateLogoutRouteInput &
  CreateMeRouteInput;

export function createAuthRoutes(input: CreateAuthRoutesInput) {
  const authRoutes = new Hono<AuthEnv>();

  authRoutes.post("/signup", createSignupRoute(input));
  authRoutes.post("/login", createLoginRoute(input));
  authRoutes.post("/refresh", createRefreshRoute(input));
  authRoutes.post("/logout", createLogoutRoute(input));
  authRoutes.get("/me", requireAccount, createMeRoute(input));

  return authRoutes;
}
