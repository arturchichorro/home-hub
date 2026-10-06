import { createRecipeImageReadUrlsRequestSchema } from "@home-hub/shared/recipe-images";
import type { Context } from "hono";
import * as z from "zod";
import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageReadUrlsInput,
  CreateRecipeImageReadUrlsResult,
} from "../images/create-read-urls";
import { imageContentUrl } from "./image-content";

export type CreateRecipeImageReadUrlsRouteInput = {
  createRecipeImageReadUrls: (
    input: CreateRecipeImageReadUrlsInput,
  ) => Promise<CreateRecipeImageReadUrlsResult>;
};

export function createRecipeImageReadUrlsRoute({
  createRecipeImageReadUrls,
}: CreateRecipeImageReadUrlsRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest =
      createRecipeImageReadUrlsRequestSchema.safeParse(body);

    if (!parsedHouseholdId.success || !parsedRequest.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await createRecipeImageReadUrls({
      principal: c.get("principal"),
      householdId: parsedHouseholdId.data,
      requests: parsedRequest.data.requests,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json(
      {
        reads: c.get("principal").guest
          ? result.reads.map((read) => ({
              ...read,
              url: imageContentUrl(
                c.req.url,
                parsedHouseholdId.data,
                read.recipeId,
                read.imageId,
                read.variant,
              ),
            }))
          : result.reads,
      },
      200,
    );
  };
}
