import type { Database } from "@home-hub/database";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import {
  createAccessPrincipalAuth,
  type PrincipalEnv,
} from "../../authorization/principal";
import { FixedWindowRateLimiter } from "../../rate-limit";
import {
  type ConfirmRecipeImageUploadRouteInput,
  confirmRecipeImageUploadRoute,
} from "./confirm-image-upload";
import {
  type CreateRecipeImageReadUrlRouteInput,
  createRecipeImageReadUrlRoute,
} from "./create-image-read-url";
import {
  type CreateRecipeImageReadUrlsRouteInput,
  createRecipeImageReadUrlsRoute,
} from "./create-image-read-urls";
import {
  type CreateRecipeImageUploadRouteInput,
  createRecipeImageUploadRoute,
} from "./create-image-upload";
import {
  type DeleteRecipeImageRouteInput,
  deleteRecipeImageRoute,
} from "./delete-image";

export type CreateRecipeRoutesInput = ConfirmRecipeImageUploadRouteInput &
  CreateRecipeImageReadUrlRouteInput &
  CreateRecipeImageReadUrlsRouteInput &
  CreateRecipeImageUploadRouteInput &
  DeleteRecipeImageRouteInput & {
    jwtSecret: string;
    principalDatabase?: Database;
  };

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<PrincipalEnv>();
  const principalAuth = createAccessPrincipalAuth({
    db: input.principalDatabase ?? ({} as Database),
    jwtSecret: input.jwtSecret,
  });
  const uploadLimiter = new FixedWindowRateLimiter(60, 60_000);
  const limitUploads = createMiddleware<PrincipalEnv>(async (c, next) => {
    const principal = c.get("principal");
    const key =
      principal.kind === "account"
        ? `account:${principal.userId}`
        : `guest:${principal.guestSessionId}`;
    if (!uploadLimiter.allow(key)) {
      c.header("Retry-After", "60");
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });

  recipeRoutes.post(
    "/:recipeId/images/uploads",
    principalAuth,
    limitUploads,
    createRecipeImageUploadRoute(input),
  );

  recipeRoutes.delete(
    "/:recipeId/images/:imageId",
    principalAuth,
    deleteRecipeImageRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/confirm",
    principalAuth,
    confirmRecipeImageUploadRoute(input),
  );

  recipeRoutes.post(
    "/images/read-urls",
    principalAuth,
    createRecipeImageReadUrlsRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/read-url",
    principalAuth,
    createRecipeImageReadUrlRoute(input),
  );

  return recipeRoutes;
}
