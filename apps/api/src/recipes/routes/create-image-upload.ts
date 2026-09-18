import {
  type CreateRecipeImageUploadRequest,
  createRecipeImageUploadRequestSchema,
} from "@home-hub/shared/recipe-images";
import type { Context } from "hono";
import * as z from "zod";

import type { RequestAccessEnv } from "../../authorization/request-access";
import type {
  CreateRecipeImageUploadInput,
  CreateRecipeImageUploadResult,
} from "../images/create-upload";

export type CreateRecipeImageUploadRouteInput = {
  createRecipeImageUpload: (
    input: CreateRecipeImageUploadInput,
  ) => Promise<CreateRecipeImageUploadResult>;
};

export function createRecipeImageUploadRoute({
  createRecipeImageUpload,
}: CreateRecipeImageUploadRouteInput) {
  return async (c: Context<RequestAccessEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const parsedRecipeId = z.uuid().safeParse(c.req.param("recipeId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest = createRecipeImageUploadRequestSchema.safeParse(body);

    if (
      !parsedHouseholdId.success ||
      !parsedRecipeId.success ||
      !parsedRequest.success
    ) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: CreateRecipeImageUploadRequest = parsedRequest.data;
    const result = await createRecipeImageUpload({
      requestAccess: c.get("requestAccess"),
      householdId: parsedHouseholdId.data,
      recipeId: parsedRecipeId.data,
      ...request,
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
        imageId: result.imageId,
        upload: {
          url: result.uploadUrl,
          expiresInSeconds: result.uploadUrlExpiresInSeconds,
          requiredHeaders: {
            "Content-Type": request.contentType,
          },
        },
      },
      201,
    );
  };
}
