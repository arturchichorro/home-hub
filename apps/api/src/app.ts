import { Hono } from "hono";

import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";
import {
  type CreateHouseholdRoutesInput,
  createHouseholdRoutes,
} from "./households/routes";
import {
  type CreateRecipeRoutesInput,
  createRecipeRoutes,
} from "./recipes/routes";
import {
  type CreateShoppingRoutesInput,
  createShoppingRoutes,
} from "./shopping/routes";
import { type CreateZeroRoutesInput, createZeroRoutes } from "./zero/routes";

export type CreateAppInput = CreateAuthRoutesInput &
  CreateHouseholdRoutesInput &
  CreateRecipeRoutesInput &
  CreateShoppingRoutesInput &
  CreateZeroRoutesInput;

export function createApp(input: CreateAppInput) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", createAuthRoutes(input));
  app.route("/households", createHouseholdRoutes(input));
  app.route("/households/:householdId/recipes", createRecipeRoutes(input));
  app.route("/households/:householdId/shopping", createShoppingRoutes(input));
  app.route("/zero", createZeroRoutes(input));

  return app;
}
