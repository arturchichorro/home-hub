import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono/types";

import type { RequestAccessEnv } from "../../authorization/request-access";
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
    authenticateRequest: MiddlewareHandler<RequestAccessEnv>;
  };

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<RequestAccessEnv>();
  const uploadLimiter = new FixedWindowRateLimiter(60, 60_000);
  const limitUploads = createMiddleware<RequestAccessEnv>(async (c, next) => {
    const requestAccess = c.get("requestAccess");
    const key =
      requestAccess.actor.kind === "account"
        ? `account:${requestAccess.actor.accountId}`
        : `guest:${requestAccess.actor.guestSessionId}`;
    if (!uploadLimiter.allow(key)) {
      c.header("Retry-After", "60");
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });

  recipeRoutes.post(
    "/:recipeId/images/uploads",
    input.authenticateRequest,
    limitUploads,
    createRecipeImageUploadRoute(input),
  );

  recipeRoutes.delete(
    "/:recipeId/images/:imageId",
    input.authenticateRequest,
    deleteRecipeImageRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/confirm",
    input.authenticateRequest,
    confirmRecipeImageUploadRoute(input),
  );

  recipeRoutes.post(
    "/images/read-urls",
    input.authenticateRequest,
    createRecipeImageReadUrlsRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/read-url",
    input.authenticateRequest,
    createRecipeImageReadUrlRoute(input),
  );

  return recipeRoutes;
}
