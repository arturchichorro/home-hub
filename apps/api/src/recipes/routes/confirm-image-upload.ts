import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  ConfirmRecipeImageUploadInput,
  ConfirmRecipeImageUploadResult,
} from "../images/confirm-upload";

export type ConfirmRecipeImageUploadRouteInput = {
  confirmRecipeImageUpload: (
    input: ConfirmRecipeImageUploadInput,
  ) => Promise<ConfirmRecipeImageUploadResult>;
};

export function confirmRecipeImageUploadRoute({
  confirmRecipeImageUpload,
}: ConfirmRecipeImageUploadRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const parsedRecipeId = z.uuid().safeParse(c.req.param("recipeId"));
    const parsedImageId = z.uuid().safeParse(c.req.param("imageId"));

    if (
      !parsedHouseholdId.success ||
      !parsedRecipeId.success ||
      !parsedImageId.success
    ) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await confirmRecipeImageUpload({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      recipeId: parsedRecipeId.data,
      imageId: parsedImageId.data,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (result.kind === "not_found") {
      return c.json({ error: "Not found" }, 404);
    }

    if (result.kind === "upload_not_found") {
      return c.json({ error: "Upload not found" }, 409);
    }

    if (result.kind === "invalid_upload") {
      return c.json({ error: "Invalid upload" }, 422);
    }

    return c.json({ image: result.image }, 200);
  };
}
