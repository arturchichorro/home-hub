import type { Context } from "hono";
import * as z from "zod";

import type { RequestAccessEnv } from "../../authorization/request-access";
import type {
  DeleteRecipeImageInput,
  DeleteRecipeImageResult,
} from "../images/delete";

export type DeleteRecipeImageRouteInput = {
  deleteRecipeImage: (
    input: DeleteRecipeImageInput,
  ) => Promise<DeleteRecipeImageResult>;
};

export function deleteRecipeImageRoute({
  deleteRecipeImage,
}: DeleteRecipeImageRouteInput) {
  return async (c: Context<RequestAccessEnv>) => {
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

    const result = await deleteRecipeImage({
      requestAccess: c.get("requestAccess"),
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

    return c.body(null, 204);
  };
}
