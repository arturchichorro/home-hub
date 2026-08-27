import { createRecipeImageReadUrlsRequestSchema } from "@home-hub/shared/recipe-images";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageReadUrlsInput,
  CreateRecipeImageReadUrlsResult,
} from "../images/create-read-urls";

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
      userId: c.get("userId"),
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

    return c.json({ reads: result.reads }, 200);
  };
}
