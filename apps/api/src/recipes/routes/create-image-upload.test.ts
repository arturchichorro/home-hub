import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateRecipeImageUploadInput,
  CreateRecipeImageUploadResult,
} from "../images/create-upload";
import { createRecipeImageUploadRoute } from "./create-image-upload";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

const body = {
  cookLogId: null,
  contentType: "image/webp",
  byteSize: 2_048,
  width: 800,
  height: 600,
  position: 0,
};

type CreateUpload = (
  input: CreateRecipeImageUploadInput,
) => Promise<CreateRecipeImageUploadResult>;

function createTestApp(createRecipeImageUpload: CreateUpload) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.post(
    "/:householdId/recipes/:recipeId/images/uploads",
    createRecipeImageUploadRoute({ createRecipeImageUpload }),
  );
  return app;
}

function postUpload(input: {
  app: ReturnType<typeof createTestApp>;
  householdId?: string;
  recipeId?: string;
  body?: string;
}) {
  return input.app.request(
    `/${input.householdId ?? householdId}/recipes/${input.recipeId ?? recipeId}/images/uploads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: input.body ?? JSON.stringify(body),
    },
  );
}

describe("create recipe image upload route", () => {
  it.each([
    ["household ID", { householdId: "not-a-uuid" }],
    ["recipe ID", { recipeId: "not-a-uuid" }],
    ["JSON", { body: "{" }],
    ["body", { body: JSON.stringify({ ...body, byteSize: 0 }) }],
  ] as const)(
    "rejects invalid %s without invoking the service",
    async (_label, request) => {
      const createRecipeImageUpload = vi.fn<CreateUpload>(async () => ({
        kind: "forbidden",
      }));
      const response = await postUpload({
        app: createTestApp(createRecipeImageUpload),
        ...request,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid request",
      });
      expect(createRecipeImageUpload).not.toHaveBeenCalled();
    },
  );

  it("passes trusted route, identity, and validated body data to the service", async () => {
    const createRecipeImageUpload = vi.fn<CreateUpload>(async () => ({
      kind: "success",
      imageId,
      uploadUrl: "https://signed-upload.example",
      uploadUrlExpiresInSeconds: 300,
    }));
    const response = await postUpload({
      app: createTestApp(createRecipeImageUpload),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      imageId,
      upload: {
        url: "https://signed-upload.example",
        expiresInSeconds: 300,
        requiredHeaders: { "Content-Type": "image/webp" },
      },
    });
    expect(createRecipeImageUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      ...body,
    });
  });

  it.each([
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["not_found", 404, "Not found"],
  ] as const)("maps %s to HTTP %s", async (kind, status, error) => {
    const app = createTestApp(async () => ({ kind }));
    const response = await postUpload({ app });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      kind === "unauthorized" ? "Bearer" : null,
    );
  });
});
