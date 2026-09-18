import { Hono, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

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
  recipeRoutes.use("*", input.authenticateRequest);
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
    limitUploads,
    createRecipeImageUploadRoute(input),
  );

  recipeRoutes.delete(
    "/:recipeId/images/:imageId",
    deleteRecipeImageRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/confirm",
    confirmRecipeImageUploadRoute(input),
  );

  recipeRoutes.post("/images/read-urls", createRecipeImageReadUrlsRoute(input));

  recipeRoutes.post(
    "/:recipeId/images/:imageId/read-url",
    createRecipeImageReadUrlRoute(input),
  );

  return recipeRoutes;
}
