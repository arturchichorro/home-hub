import { createRecipeImageReadUrlRequestSchema } from "@home-hub/shared/recipe-images";
import type { Context } from "hono";
import * as z from "zod";
import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageReadUrlInput,
  CreateRecipeImageReadUrlResult,
} from "../images/create-read-url";
import { imageContentUrl } from "./image-content";

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
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest = createRecipeImageReadUrlRequestSchema.safeParse(body);

    if (
      !parsedHouseholdId.success ||
      !parsedRecipeId.success ||
      !parsedImageId.success ||
      !parsedRequest.success
    ) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await createRecipeImageReadUrl({
      principal: c.get("principal"),
      householdId: parsedHouseholdId.data,
      recipeId: parsedRecipeId.data,
      imageId: parsedImageId.data,
      variant: parsedRequest.data.variant,
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
          url: c.get("principal").guest
            ? imageContentUrl(
                c.req.url,
                parsedHouseholdId.data,
                parsedRecipeId.data,
                parsedImageId.data,
                parsedRequest.data.variant,
              )
            : result.url,
          expiresInSeconds: result.expiresInSeconds,
        },
      },
      200,
    );
  };
}
