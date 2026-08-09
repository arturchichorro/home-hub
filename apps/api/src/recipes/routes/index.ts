import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type ConfirmRecipeImageUploadRouteInput,
  confirmRecipeImageUploadRoute,
} from "./confirm-image-upload";
import {
  type CreateRecipeImageUploadRouteInput,
  createRecipeImageUploadRoute,
} from "./create-image-upload";

export type CreateRecipeRoutesInput = ConfirmRecipeImageUploadRouteInput &
  CreateRecipeImageUploadRouteInput & {
    jwtSecret: string;
  };

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<AuthEnv>();

  recipeRoutes.post(
    "/:recipeId/images/uploads",
    createBearerAuth(input.jwtSecret),
    createRecipeImageUploadRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/confirm",
    createBearerAuth(input.jwtSecret),
    confirmRecipeImageUploadRoute(input),
  );

  return recipeRoutes;
}
