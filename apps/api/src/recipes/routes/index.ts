import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
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
  };

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<AuthEnv>();

  recipeRoutes.post(
    "/:recipeId/images/uploads",
    createBearerAuth(input.jwtSecret),
    createRecipeImageUploadRoute(input),
  );

  recipeRoutes.delete(
    "/:recipeId/images/:imageId",
    createBearerAuth(input.jwtSecret),
    deleteRecipeImageRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/confirm",
    createBearerAuth(input.jwtSecret),
    confirmRecipeImageUploadRoute(input),
  );

  recipeRoutes.post(
    "/images/read-urls",
    createBearerAuth(input.jwtSecret),
    createRecipeImageReadUrlsRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/read-url",
    createBearerAuth(input.jwtSecret),
    createRecipeImageReadUrlRoute(input),
  );

  return recipeRoutes;
}
