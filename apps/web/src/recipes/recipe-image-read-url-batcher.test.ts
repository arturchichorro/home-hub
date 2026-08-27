import { afterEach, describe, expect, it, vi } from "vitest";
import { createBatchedRecipeImageReadUrl } from "./recipe-image-read-url-batcher";

const fetchMock = vi.fn<typeof fetch>();
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const secondRecipeId = "6cf49996-4171-4c9e-a401-48fe1d12504a";
const firstImageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const secondImageId = "7581fc9c-7acf-47b7-ad4b-9bcc1001cc67";

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("recipe image read URL batcher", () => {
  it("combines simultaneous URL misses for one household", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        reads: [firstImageId, secondImageId].map((imageId, index) => ({
          imageId,
          recipeId: index === 0 ? recipeId : secondRecipeId,
          variant: "thumbnail",
          url: `https://images.example/${imageId}`,
          expiresInSeconds: 3_600,
        })),
      }),
    );
    const identity = {
      accessToken: "access-token",
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      householdId,
      recipeId,
      variant: "thumbnail" as const,
    };

    const results = await Promise.all([
      createBatchedRecipeImageReadUrl({
        ...identity,
        imageId: firstImageId,
      }),
      createBatchedRecipeImageReadUrl({
        ...identity,
        imageId: secondImageId,
        recipeId: secondRecipeId,
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        requests: [
          { imageId: firstImageId, recipeId, variant: "thumbnail" },
          {
            imageId: secondImageId,
            recipeId: secondRecipeId,
            variant: "thumbnail",
          },
        ],
      }),
    );
  });
});
