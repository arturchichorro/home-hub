import { Hono } from "hono";

import type { RequestAccessEnv } from "../../authorization/request-access";
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
  DeleteRecipeImageRouteInput;

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<RequestAccessEnv>();
  recipeRoutes.post(
    "/:recipeId/images/uploads",
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
