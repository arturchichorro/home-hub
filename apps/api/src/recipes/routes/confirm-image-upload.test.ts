import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  ConfirmRecipeImageUploadInput,
  ConfirmRecipeImageUploadResult,
} from "../images/confirm-upload";
import { confirmRecipeImageUploadRoute } from "./confirm-image-upload";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

type ConfirmUpload = (
  input: ConfirmRecipeImageUploadInput,
) => Promise<ConfirmRecipeImageUploadResult>;

function createTestApp(confirmRecipeImageUpload: ConfirmUpload) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.post(
    "/:householdId/recipes/:recipeId/images/:imageId/confirm",
    confirmRecipeImageUploadRoute({ confirmRecipeImageUpload }),
  );
  return app;
}

function postConfirmation(
  app: ReturnType<typeof createTestApp>,
  params: {
    householdId?: string;
    recipeId?: string;
    imageId?: string;
  } = {},
) {
  return app.request(
    `/${params.householdId ?? householdId}/recipes/${params.recipeId ?? recipeId}/images/${params.imageId ?? imageId}/confirm`,
    { method: "POST" },
  );
}

describe("confirm recipe image upload route", () => {
  it.each([
    ["household ID", { householdId: "not-a-uuid" }],
    ["recipe ID", { recipeId: "not-a-uuid" }],
    ["image ID", { imageId: "not-a-uuid" }],
  ] as const)("rejects an invalid %s", async (_label, params) => {
    const confirmRecipeImageUpload = vi.fn<ConfirmUpload>(async () => ({
      kind: "forbidden",
    }));

    const response = await postConfirmation(
      createTestApp(confirmRecipeImageUpload),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request",
    });
    expect(confirmRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("passes route and authenticated identity data to the service", async () => {
    const confirmedAt = new Date("2026-08-10T12:00:00.000Z");
    const confirmRecipeImageUpload = vi.fn<ConfirmUpload>(async () => ({
      kind: "success",
      image: { id: imageId, confirmedAt },
    }));

    const response = await postConfirmation(
      createTestApp(confirmRecipeImageUpload),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      image: { id: imageId, confirmedAt: confirmedAt.toISOString() },
    });
    expect(confirmRecipeImageUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      imageId,
    });
  });

  it.each([
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["not_found", 404, "Not found"],
    ["upload_not_found", 409, "Upload not found"],
    ["invalid_upload", 422, "Invalid upload"],
  ] as const)("maps %s to HTTP %s", async (kind, status, error) => {
    const response = await postConfirmation(
      createTestApp(async () => ({ kind })),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      kind === "unauthorized" ? "Bearer" : null,
    );
  });
});
