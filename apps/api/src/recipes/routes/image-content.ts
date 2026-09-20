import { recipeImageVariants } from "@home-hub/shared/recipe-image-delivery";
import { maxRecipeImageByteSize } from "@home-hub/shared/recipe-images";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import * as z from "zod";
import type { AuthEnv } from "../../auth/bearer-auth";
import type { createUploadRecipeImageContent } from "../images/upload-content";
import type { CreateRecipeImageReadUrlRouteInput } from "./create-image-read-url";
export type ImageContentServices = CreateRecipeImageReadUrlRouteInput & {
  uploadRecipeImageContent: ReturnType<typeof createUploadRecipeImageContent>;
};
const scope = z.object({
  householdId: z.uuid(),
  recipeId: z.uuid(),
  imageId: z.uuid(),
});
export function installImageContentRoutes(
  routes: Hono<AuthEnv>,
  services: ImageContentServices,
) {
  const path = "/:recipeId/images/:imageId/content";
  routes.get(path, async (c) => {
    const parsed = scope.safeParse(c.req.param());
    const variant = z
      .enum(recipeImageVariants)
      .safeParse(c.req.query("variant"));
    if (!parsed.success || !variant.success)
      return c.json({ error: "Invalid request" }, 400);
    const result = await services.createRecipeImageReadUrl({
      ...parsed.data,
      principal: c.get("principal"),
      variant: variant.data,
    });
    if (result.kind !== "success")
      return c.json(
        { error: "Image unavailable" },
        result.kind === "unauthorized"
          ? 401
          : result.kind === "forbidden"
            ? 403
            : 404,
      );
    const response = await fetch(result.url);
    if (!response.ok) return c.json({ error: "Image unavailable" }, 502);
    return new Response(response.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  routes.put(
    path,
    bodyLimit({ maxSize: maxRecipeImageByteSize }),
    async (c) => {
      const parsed = scope.safeParse(c.req.param());
      if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
      const result = await services.uploadRecipeImageContent({
        ...parsed.data,
        principal: c.get("principal"),
        contentType: c.req.header("Content-Type") ?? "",
        body: new Uint8Array(await c.req.arrayBuffer()),
      });
      if (result.kind !== "success")
        return c.json(
          { error: "Image unavailable" },
          result.kind === "unauthorized"
            ? 401
            : result.kind === "forbidden"
              ? 403
              : result.kind === "invalid"
                ? 400
                : 404,
        );
      c.header("Cache-Control", "no-store");
      return c.body(null, 204);
    },
  );
}
export function imageContentUrl(
  origin: string,
  householdId: string,
  recipeId: string,
  imageId: string,
  variant?: string,
) {
  const url = new URL(
    `/api/households/${householdId}/recipes/${recipeId}/images/${imageId}/content`,
    origin,
  );
  if (variant) url.searchParams.set("variant", variant);
  return url.href;
}
