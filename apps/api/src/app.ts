import { Hono } from "hono";

import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";
import {
  type CreateHouseholdRoutesInput,
  createHouseholdRoutes,
} from "./households/routes";
import {
  type CreateShoppingRoutesInput,
  createShoppingRoutes,
} from "./shopping/routes";

export type CreateAppInput = CreateAuthRoutesInput &
  CreateHouseholdRoutesInput &
  CreateShoppingRoutesInput;

export function createApp(input: CreateAppInput) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", createAuthRoutes(input));
  app.route("/households", createHouseholdRoutes(input));
  app.route("/households/:householdId/shopping", createShoppingRoutes(input));

  return app;
}
