import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmRecipeImageUpload,
  createRecipeImageReadUrl,
  createRecipeImageReadUrls,
  deleteRecipeImage,
  requestRecipeImageUpload,
  uploadRecipeImageObject,
} from "./image-api";

const accessToken = "access-token";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const commandInput = { accessToken, householdId, recipeId, imageId };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recipe image API", () => {
  it("requests validated upload instructions", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        imageId,
        upload: {
          url: "https://upload.example/image",
          expiresInSeconds: 300,
          requiredHeaders: { "Content-Type": "image/webp" },
        },
      }),
    );

    await expect(
      requestRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        cookLogId: null,
        contentType: "image/webp",
        byteSize: 2_048,
        width: 800,
        height: 600,
        position: 0,
      }),
    ).resolves.toMatchObject({ kind: "success", imageId });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/recipes/${recipeId}/images/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cookLogId: null,
          contentType: "image/webp",
          byteSize: 2_048,
          width: 800,
          height: 600,
          position: 0,
        }),
      },
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
  ] as const)("maps upload request status %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    await expect(
      requestRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        cookLogId: null,
        contentType: "image/png",
        byteSize: 1,
        width: 1,
        height: 1,
        position: 0,
      }),
    ).resolves.toEqual({ kind });
  });

  it("uploads the original file with exactly the signed headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const file = new File(["image"], "recipe.webp", {
      type: "image/webp",
    });

    await expect(
      uploadRecipeImageObject({
        file,
        upload: {
          url: "https://upload.example/image",
          expiresInSeconds: 300,
          requiredHeaders: { "Content-Type": "image/webp" },
        },
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://upload.example/image", {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: file,
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "upload_not_found"],
    [422, "invalid_upload"],
  ] as const)("maps confirmation status %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    await expect(confirmRecipeImageUpload(commandInput)).resolves.toEqual({
      kind,
    });
  });

  it("validates successful confirmation", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        image: { id: imageId, confirmedAt: "2026-08-10T12:00:00.000Z" },
      }),
    );

    await expect(confirmRecipeImageUpload(commandInput)).resolves.toEqual({
      kind: "success",
    });
  });

  it("returns a validated signed read URL", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        read: { url: "https://read.example/image", expiresInSeconds: 300 },
      }),
    );

    await expect(
      createRecipeImageReadUrl({ ...commandInput, variant: "viewer" }),
    ).resolves.toEqual({
      kind: "success",
      url: "https://read.example/image",
      expiresInSeconds: 300,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/recipes/${recipeId}/images/${imageId}/read-url`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variant: "viewer" }),
      },
    );
  });

  it("returns validated signed read URLs in one batch", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        reads: [
          {
            imageId,
            recipeId,
            variant: "thumbnail",
            url: "https://read.example/image",
            expiresInSeconds: 3_600,
          },
        ],
      }),
    );

    await expect(
      createRecipeImageReadUrls({
        accessToken,
        householdId,
        requests: [{ imageId, recipeId, variant: "thumbnail" }],
      }),
    ).resolves.toEqual({
      kind: "success",
      reads: [
        {
          imageId,
          recipeId,
          variant: "thumbnail",
          url: "https://read.example/image",
          expiresInSeconds: 3_600,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/recipes/images/read-urls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ imageId, recipeId, variant: "thumbnail" }],
        }),
      },
    );
  });

  it("deletes image metadata and object through the API", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteRecipeImage(commandInput)).resolves.toEqual({
      kind: "success",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/recipes/${recipeId}/images/${imageId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  });
});
