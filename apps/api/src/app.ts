import type { Database } from "@home-hub/database";
import { Hono } from "hono";

import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";
import { createRequestAccessAuth } from "./authorization/request-access";
import {
  type CreateGuestAccessRoutesInput,
  createGuestAccessRoutes,
} from "./guest-access/routes";
import {
  type CreateHouseholdRoutesInput,
  createHouseholdRoutes,
} from "./households/routes";
import {
  installApiObservability,
  type ObservabilityEnv,
  type StructuredLogger,
} from "./observability";
import type { ReadinessCheck } from "./readiness";
import {
  type CreateRecipeRoutesInput,
  createRecipeRoutes,
} from "./recipes/routes";
import { type CreateZeroRoutesInput, createZeroRoutes } from "./zero/routes";

type AuthServices = Omit<CreateAuthRoutesInput, "isProduction" | "jwtSecret">;
type HouseholdServices = Omit<CreateHouseholdRoutesInput, "jwtSecret">;
type RecipeImageServices = CreateRecipeRoutesInput;

export type CreateAppInput = {
  auth: AuthServices;
  guestAccess: Omit<CreateGuestAccessRoutesInput, "isProduction">;
  households: HouseholdServices;
  recipeImages: RecipeImageServices;
  infrastructure: {
    isProduction: boolean;
    jwtSecret: string;
    logger: StructuredLogger;
    database: Database;
    readinessCheck: ReadinessCheck;
    zeroDbProvider: CreateZeroRoutesInput["dbProvider"];
  };
};

export function createApp(input: CreateAppInput) {
  const app = new Hono<ObservabilityEnv>();
  const {
    isProduction,
    jwtSecret,
    logger,
    database,
    readinessCheck,
    zeroDbProvider,
  } = input.infrastructure;

  installApiObservability(app, { logger });
  const authenticateRequest = createRequestAccessAuth({
    db: database,
    jwtSecret,
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/ready", async (c) => {
    try {
      await readinessCheck();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });
  app.route(
    "/api/auth",
    createAuthRoutes({ ...input.auth, isProduction, jwtSecret }),
  );
  app.route(
    "/api/guest",
    createGuestAccessRoutes({ ...input.guestAccess, isProduction }),
  );
  app.route(
    "/api/households",
    createHouseholdRoutes({ ...input.households, jwtSecret }),
  );
  app.use("/api/households/:householdId/recipes/*", authenticateRequest);
  app.route(
    "/api/households/:householdId/recipes",
    createRecipeRoutes(input.recipeImages),
  );
  app.use("/api/zero/*", authenticateRequest);
  app.route(
    "/api/zero",
    createZeroRoutes({
      dbProvider: zeroDbProvider,
      authorizationDatabase: database,
    }),
  );

  return app;
}
