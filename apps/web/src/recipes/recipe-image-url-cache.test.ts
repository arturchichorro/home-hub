import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRecipeImageUrlCache,
  getOrCreateRecipeImageUrl,
  invalidateRecipeImageUrl,
  readCachedRecipeImageUrl,
} from "./recipe-image-url-cache";

const identity = {
  accessToken: "access-token",
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  recipeId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  imageId: "b5b8a5ea-89cb-4c31-a93d-33049ab11c73",
};

afterEach(() => {
  clearRecipeImageUrlCache();
  vi.restoreAllMocks();
});

describe("recipe image URL cache", () => {
  it("reuses one signed URL across later consumers", async () => {
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/signed",
      expiresInSeconds: 300,
    }));

    await getOrCreateRecipeImageUrl(identity, createUrl);
    await getOrCreateRecipeImageUrl(identity, createUrl);

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(readCachedRecipeImageUrl(identity)?.url).toBe(
      "https://images.example/signed",
    );
  });

  it("deduplicates simultaneous requests", async () => {
    let resolveRequest:
      | ((result: Awaited<ReturnType<typeof createUrl>>) => void)
      | undefined;
    const createUrl = vi.fn(
      () =>
        new Promise<{
          kind: "success";
          url: string;
          expiresInSeconds: number;
        }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = getOrCreateRecipeImageUrl(identity, createUrl);
    const second = getOrCreateRecipeImageUrl(identity, createUrl);
    resolveRequest?.({
      kind: "success",
      url: "https://images.example/signed",
      expiresInSeconds: 300,
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it("refreshes a URL near its expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/signed",
      expiresInSeconds: 100,
    }));
    await getOrCreateRecipeImageUrl(identity, createUrl);

    vi.spyOn(Date, "now").mockReturnValue(91_000);
    expect(readCachedRecipeImageUrl(identity)).toBeUndefined();
    await getOrCreateRecipeImageUrl(identity, createUrl);

    expect(createUrl).toHaveBeenCalledTimes(2);
  });

  it("isolates access tokens and invalidates every token for a deleted image", async () => {
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/signed",
      expiresInSeconds: 300,
    }));
    const otherSession = { ...identity, accessToken: "other-token" };

    await getOrCreateRecipeImageUrl(identity, createUrl);
    await getOrCreateRecipeImageUrl(otherSession, createUrl);
    expect(createUrl).toHaveBeenCalledTimes(2);

    invalidateRecipeImageUrl(identity);
    expect(readCachedRecipeImageUrl(identity)).toBeUndefined();
    expect(readCachedRecipeImageUrl(otherSession)).toBeUndefined();
  });
});
