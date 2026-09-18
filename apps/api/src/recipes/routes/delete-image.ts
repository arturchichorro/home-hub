import type { Context } from "hono";
import * as z from "zod";

import {
  type PrincipalEnv,
  principalServiceInput,
} from "../../authorization/principal";
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
  return async (c: Context<PrincipalEnv>) => {
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
      ...principalServiceInput(c.get("principal"), c.get("userId")),
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
