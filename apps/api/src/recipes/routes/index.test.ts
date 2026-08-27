import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  ConfirmRecipeImageUploadInput,
  ConfirmRecipeImageUploadResult,
} from "../images/confirm-upload";
import type {
  CreateRecipeImageReadUrlInput,
  CreateRecipeImageReadUrlResult,
} from "../images/create-read-url";
import type {
  CreateRecipeImageReadUrlsInput,
  CreateRecipeImageReadUrlsResult,
} from "../images/create-read-urls";
import type {
  CreateRecipeImageUploadInput,
  CreateRecipeImageUploadResult,
} from "../images/create-upload";
import type {
  DeleteRecipeImageInput,
  DeleteRecipeImageResult,
} from "../images/delete";
import { createRecipeRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestApp(
  createRecipeImageUpload: (
    input: CreateRecipeImageUploadInput,
  ) => Promise<CreateRecipeImageUploadResult>,
  confirmRecipeImageUpload: (
    input: ConfirmRecipeImageUploadInput,
  ) => Promise<ConfirmRecipeImageUploadResult> = async () => ({
    kind: "forbidden",
  }),
  createRecipeImageReadUrl: (
    input: CreateRecipeImageReadUrlInput,
  ) => Promise<CreateRecipeImageReadUrlResult> = async () => ({
    kind: "forbidden",
  }),
  deleteRecipeImage: (
    input: DeleteRecipeImageInput,
  ) => Promise<DeleteRecipeImageResult> = async () => ({
    kind: "forbidden",
  }),
  createRecipeImageReadUrls: (
    input: CreateRecipeImageReadUrlsInput,
  ) => Promise<CreateRecipeImageReadUrlsResult> = async () => ({
    kind: "forbidden",
  }),
) {
  const app = new Hono();
  app.route(
    "/:householdId/recipes",
    createRecipeRoutes({
      confirmRecipeImageUpload,
      createRecipeImageReadUrl,
      createRecipeImageReadUrls,
      createRecipeImageUpload,
      deleteRecipeImage,
      jwtSecret,
    }),
  );
  return app;
}

const body = {
  cookLogId: null,
  contentType: "image/webp",
  byteSize: 2_048,
  width: 800,
  height: 600,
  position: 0,
};

describe("recipe routes", () => {
  it("rejects an unauthenticated upload request before invoking the service", async () => {
    const createRecipeImageUpload = vi.fn(
      async (): Promise<CreateRecipeImageUploadResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestApp(createRecipeImageUpload);

    const response = await app.request(
      `/${householdId}/recipes/${recipeId}/images/uploads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(createRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("mounts authenticated uploads under the household recipe", async () => {
    const createRecipeImageUpload = vi.fn(
      async (): Promise<CreateRecipeImageUploadResult> => ({
        kind: "success",
        imageId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
        uploadUrl: "https://signed-upload.example",
        uploadUrlExpiresInSeconds: 300,
      }),
    );
    const app = createTestApp(createRecipeImageUpload);

    const response = await app.request(
      `/${householdId}/recipes/${recipeId}/images/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(201);
    expect(createRecipeImageUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      ...body,
    });
  });

  it("mounts authenticated confirmation under the uploaded image", async () => {
    const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
    const confirmedAt = new Date("2026-08-10T12:00:00.000Z");
    const confirmRecipeImageUpload = vi.fn(
      async (): Promise<ConfirmRecipeImageUploadResult> => ({
        kind: "success",
        image: { id: imageId, confirmedAt },
      }),
    );
    const app = createTestApp(
      async () => ({ kind: "forbidden" }),
      confirmRecipeImageUpload,
    );

    const response = await app.request(
      `/${householdId}/recipes/${recipeId}/images/${imageId}/confirm`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${createAccessToken()}` },
      },
    );

    expect(response.status).toBe(200);
    expect(confirmRecipeImageUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      imageId,
    });
  });

  it("mounts authenticated read URLs under the confirmed image", async () => {
    const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
    const createRecipeImageReadUrl = vi.fn(
      async (): Promise<CreateRecipeImageReadUrlResult> => ({
        kind: "success",
        url: "https://signed-read.example",
        expiresInSeconds: 300,
      }),
    );
    const app = createTestApp(
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      createRecipeImageReadUrl,
    );

    const response = await app.request(
      `/${householdId}/recipes/${recipeId}/images/${imageId}/read-url`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variant: "thumbnail" }),
      },
    );

    expect(response.status).toBe(200);
    expect(createRecipeImageReadUrl).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      imageId,
      variant: "thumbnail",
    });
  });

  it("mounts authenticated batched read URLs under the recipe", async () => {
    const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
    const createRecipeImageReadUrls = vi.fn(
      async (): Promise<CreateRecipeImageReadUrlsResult> => ({
        kind: "success",
        reads: [
          {
            imageId,
            recipeId,
            variant: "thumbnail",
            url: "https://signed-read.example",
            expiresInSeconds: 3_600,
          },
        ],
      }),
    );
    const app = createTestApp(
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      createRecipeImageReadUrls,
    );

    const response = await app.request(
      `/${householdId}/recipes/images/read-urls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ imageId, recipeId, variant: "thumbnail" }],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(createRecipeImageReadUrls).toHaveBeenCalledWith({
      userId,
      householdId,
      requests: [{ imageId, recipeId, variant: "thumbnail" }],
    });
  });

  it("mounts authenticated deletion under the recipe image", async () => {
    const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
    const deleteRecipeImage = vi.fn(
      async (): Promise<DeleteRecipeImageResult> => ({ kind: "success" }),
    );
    const app = createTestApp(
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      async () => ({ kind: "forbidden" }),
      deleteRecipeImage,
    );

    const response = await app.request(
      `/${householdId}/recipes/${recipeId}/images/${imageId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${createAccessToken()}` },
      },
    );

    expect(response.status).toBe(204);
    expect(deleteRecipeImage).toHaveBeenCalledWith({
      userId,
      householdId,
      recipeId,
      imageId,
    });
  });
});
