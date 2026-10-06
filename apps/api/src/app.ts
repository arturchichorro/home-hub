import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "./auth/bearer-auth";
import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";
import type { createValidateGuestCredential } from "./guest-access/credential";
import { createGuestLinkRoutes } from "./guest-access/routes";
import type { GuestLinkService } from "./guest-access/service";
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
type RecipeImageServices = Omit<CreateRecipeRoutesInput, "jwtSecret">;

export type CreateAppInput = {
  guestLinks: GuestLinkService;
  auth: AuthServices;
  households: HouseholdServices;
  recipeImages: RecipeImageServices;
  infrastructure: {
    isProduction: boolean;
    jwtSecret: string;
    validateGuest: ReturnType<typeof createValidateGuestCredential>;
    logger: StructuredLogger;
    readinessCheck: ReadinessCheck;
    zeroDbProvider: CreateZeroRoutesInput["dbProvider"];
  };
};

export function createApp(input: CreateAppInput) {
  const app = new Hono<ObservabilityEnv & AuthEnv>();
  const { isProduction, jwtSecret, logger, readinessCheck, zeroDbProvider } =
    input.infrastructure;

  installApiObservability(app, { logger });

  const authenticate = createBearerAuth(
    jwtSecret,
    input.infrastructure.validateGuest,
  );
  const publicEndpoints = new Set([
    "GET /api/health",
    "GET /api/ready",
    "POST /api/auth/login",
    "POST /api/auth/signup",
    "POST /api/auth/refresh",
    "POST /api/auth/logout",
  ]);
  app.use("/api/*", async (c, next) => {
    if (publicEndpoints.has(`${c.req.method} ${c.req.path}`)) return next();
    return authenticate(c, next);
  });
  app.get("/api/access", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(c.get("principal"));
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
  app.route("/api/auth", createAuthRoutes({ ...input.auth, isProduction }));
  app.route("/api/households", createHouseholdRoutes(input.households));
  app.route(
    "/api/households/:householdId/recipes",
    createRecipeRoutes(input.recipeImages),
  );
  app.route("/api/zero", createZeroRoutes({ dbProvider: zeroDbProvider }));

  app.route(
    "/api/households/:householdId/guest-access-links",
    createGuestLinkRoutes({ service: input.guestLinks }),
  );

  return app;
}
