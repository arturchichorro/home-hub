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

type AuthServices = Omit<CreateAuthRoutesInput, "isProduction" | "jwtSecret">;
type HouseholdServices = Omit<CreateHouseholdRoutesInput, "jwtSecret">;
type RecipeImageServices = Omit<CreateRecipeRoutesInput, "jwtSecret">;
type ShoppingServices = Omit<CreateShoppingRoutesInput, "jwtSecret">;

export type CreateAppInput = {
  auth: AuthServices;
  households: HouseholdServices;
  recipeImages: RecipeImageServices;
  shopping: ShoppingServices;
  infrastructure: {
    isProduction: boolean;
    jwtSecret: string;
    zeroDbProvider: CreateZeroRoutesInput["dbProvider"];
  };
};

export function createApp(input: CreateAppInput) {
  const app = new Hono();
  const { isProduction, jwtSecret, zeroDbProvider } = input.infrastructure;

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route(
    "/api/auth",
    createAuthRoutes({ ...input.auth, isProduction, jwtSecret }),
  );
  app.route(
    "/api/households",
    createHouseholdRoutes({ ...input.households, jwtSecret }),
  );
  app.route(
    "/api/households/:householdId/recipes",
    createRecipeRoutes({ ...input.recipeImages, jwtSecret }),
  );
  app.route(
    "/api/households/:householdId/shopping",
    createShoppingRoutes({ ...input.shopping, jwtSecret }),
  );
  app.route(
    "/api/zero",
    createZeroRoutes({ dbProvider: zeroDbProvider, jwtSecret }),
  );

  return app;
}
