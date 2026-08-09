import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type CreateRecipeImageUploadRouteInput,
  createRecipeImageUploadRoute,
} from "./create-image-upload";

export type CreateRecipeRoutesInput = CreateRecipeImageUploadRouteInput & {
  jwtSecret: string;
};

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<AuthEnv>();

  recipeRoutes.post(
    "/:recipeId/images/uploads",
    createBearerAuth(input.jwtSecret),
    createRecipeImageUploadRoute(input),
  );

  return recipeRoutes;
}
