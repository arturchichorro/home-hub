import { Hono } from "hono";
import type { AuthEnv } from "../../auth/bearer-auth";
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
import {
  type ImageContentServices,
  installImageContentRoutes,
} from "./image-content";

export type CreateRecipeRoutesInput = ImageContentServices &
  ConfirmRecipeImageUploadRouteInput &
  CreateRecipeImageReadUrlRouteInput &
  CreateRecipeImageReadUrlsRouteInput &
  CreateRecipeImageUploadRouteInput &
  DeleteRecipeImageRouteInput;

export function createRecipeRoutes(input: CreateRecipeRoutesInput) {
  const recipeRoutes = new Hono<AuthEnv>();

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

  recipeRoutes.post(
    "/images/read-urls",

    createRecipeImageReadUrlsRoute(input),
  );

  recipeRoutes.post(
    "/:recipeId/images/:imageId/read-url",

    createRecipeImageReadUrlRoute(input),
  );

  installImageContentRoutes(recipeRoutes, input);
  return recipeRoutes;
}
