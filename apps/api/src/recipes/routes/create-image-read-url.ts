import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageReadUrlInput,
  CreateRecipeImageReadUrlResult,
} from "../images/create-read-url";

export type CreateRecipeImageReadUrlRouteInput = {
  createRecipeImageReadUrl: (
    input: CreateRecipeImageReadUrlInput,
  ) => Promise<CreateRecipeImageReadUrlResult>;
};

export function createRecipeImageReadUrlRoute({
  createRecipeImageReadUrl,
}: CreateRecipeImageReadUrlRouteInput) {
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

    const result = await createRecipeImageReadUrl({
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

    return c.json(
      {
        read: {
          url: result.url,
          expiresInSeconds: result.expiresInSeconds,
        },
      },
      200,
    );
  };
}
