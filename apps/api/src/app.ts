import { Hono } from "hono";

import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";
import {
  type CreateHouseholdRoutesInput,
  createHouseholdRoutes,
} from "./households/routes";

export type CreateAppInput = CreateAuthRoutesInput & CreateHouseholdRoutesInput;

export function createApp(input: CreateAppInput) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", createAuthRoutes(input));
  app.route("/households", createHouseholdRoutes(input));

  return app;
}
