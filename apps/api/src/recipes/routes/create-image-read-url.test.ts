import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageReadUrlInput,
  CreateRecipeImageReadUrlResult,
} from "../images/create-read-url";
import { createRecipeImageReadUrlRoute } from "./create-image-read-url";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

type CreateReadUrl = (
  input: CreateRecipeImageReadUrlInput,
) => Promise<CreateRecipeImageReadUrlResult>;

function createTestApp(createRecipeImageReadUrl: CreateReadUrl) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.post(
    "/:householdId/recipes/:recipeId/images/:imageId/read-url",
    createRecipeImageReadUrlRoute({ createRecipeImageReadUrl }),
  );
  return app;
}

function postReadUrl(
  app: ReturnType<typeof createTestApp>,
  params: {
    householdId?: string;
    recipeId?: string;
    imageId?: string;
  } = {},
) {
  return app.request(
    `/${params.householdId ?? householdId}/recipes/${params.recipeId ?? recipeId}/images/${params.imageId ?? imageId}/read-url`,
    { method: "POST" },
  );
}

describe("create recipe image read URL route", () => {
  it.each([
    ["household ID", { householdId: "invalid" }],
    ["recipe ID", { recipeId: "invalid" }],
    ["image ID", { imageId: "invalid" }],
  ] as const)("rejects an invalid %s", async (_label, params) => {
    const createRecipeImageReadUrl = vi.fn<CreateReadUrl>(async () => ({
      kind: "forbidden",
    }));

    const response = await postReadUrl(
      createTestApp(createRecipeImageReadUrl),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request",
    });
    expect(createRecipeImageReadUrl).not.toHaveBeenCalled();
  });

  it("returns a signed read URL for the route-scoped image", async () => {
    const createRecipeImageReadUrl = vi.fn<CreateReadUrl>(async () => ({
      kind: "success",
      url: "https://signed-read.example",
      expiresInSeconds: 300,
    }));

    const response = await postReadUrl(createTestApp(createRecipeImageReadUrl));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      read: { url: "https://signed-read.example", expiresInSeconds: 300 },
    });
    expect(createRecipeImageReadUrl).toHaveBeenCalledWith({
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
  ] as const)("maps %s to HTTP %s", async (kind, status, error) => {
    const response = await postReadUrl(createTestApp(async () => ({ kind })));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      kind === "unauthorized" ? "Bearer" : null,
    );
  });
});
