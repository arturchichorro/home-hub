import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  DeleteRecipeImageInput,
  DeleteRecipeImageResult,
} from "../images/delete";
import { deleteRecipeImageRoute } from "./delete-image";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

type DeleteImage = (
  input: DeleteRecipeImageInput,
) => Promise<DeleteRecipeImageResult>;

function createTestApp(deleteRecipeImage: DeleteImage) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.delete(
    "/:householdId/recipes/:recipeId/images/:imageId",
    deleteRecipeImageRoute({ deleteRecipeImage }),
  );
  return app;
}

function deleteImage(
  app: ReturnType<typeof createTestApp>,
  params: {
    householdId?: string;
    recipeId?: string;
    imageId?: string;
  } = {},
) {
  return app.request(
    `/${params.householdId ?? householdId}/recipes/${params.recipeId ?? recipeId}/images/${params.imageId ?? imageId}`,
    { method: "DELETE" },
  );
}

describe("delete recipe image route", () => {
  it.each([
    ["household ID", { householdId: "invalid" }],
    ["recipe ID", { recipeId: "invalid" }],
    ["image ID", { imageId: "invalid" }],
  ] as const)("rejects an invalid %s", async (_label, params) => {
    const deleteRecipeImage = vi.fn<DeleteImage>(async () => ({
      kind: "success",
    }));

    const response = await deleteImage(
      createTestApp(deleteRecipeImage),
      params,
    );

    expect(response.status).toBe(400);
    expect(deleteRecipeImage).not.toHaveBeenCalled();
  });

  it("returns no content after idempotent deletion", async () => {
    const deleteRecipeImage = vi.fn<DeleteImage>(async () => ({
      kind: "success",
    }));

    const response = await deleteImage(createTestApp(deleteRecipeImage));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deleteRecipeImage).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      imageId,
    });
  });

  it.each([
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
  ] as const)("maps %s to HTTP %s", async (kind, status, error) => {
    const response = await deleteImage(createTestApp(async () => ({ kind })));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      kind === "unauthorized" ? "Bearer" : null,
    );
  });
});
