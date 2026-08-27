import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRecipeImageUrlCache,
  getOrCreateRecipeImageUrl,
  invalidateRecipeImageUrl,
  readCachedRecipeImageUrl,
} from "./recipe-image-url-cache";

const identity = {
  accessToken: "access-token",
  userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  recipeId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  imageId: "b5b8a5ea-89cb-4c31-a93d-33049ab11c73",
  variant: "thumbnail" as const,
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

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

  it("reuses URLs across token refreshes and isolates users", async () => {
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/signed",
      expiresInSeconds: 300,
    }));
    const otherSession = { ...identity, accessToken: "other-token" };
    const otherUser = {
      ...identity,
      accessToken: "other-token",
      userId: "b6dd68d1-1455-443d-b871-49b7c71d6646",
    };

    await getOrCreateRecipeImageUrl(identity, createUrl);
    await getOrCreateRecipeImageUrl(otherSession, createUrl);
    await getOrCreateRecipeImageUrl(otherUser, createUrl);
    expect(createUrl).toHaveBeenCalledTimes(2);

    invalidateRecipeImageUrl(identity);
    expect(readCachedRecipeImageUrl(identity)).toBeUndefined();
    expect(readCachedRecipeImageUrl(otherSession)).toBeUndefined();
    expect(readCachedRecipeImageUrl(otherUser)).toBeDefined();
  });

  it("keeps display variants separate", async () => {
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: `https://images.example/signed-${createUrl.mock.calls.length}`,
      expiresInSeconds: 300,
    }));
    const viewerIdentity = { ...identity, variant: "viewer" as const };

    await getOrCreateRecipeImageUrl(identity, createUrl);
    await getOrCreateRecipeImageUrl(viewerIdentity, createUrl);

    expect(createUrl).toHaveBeenCalledTimes(2);
    expect(readCachedRecipeImageUrl(identity)?.url).not.toBe(
      readCachedRecipeImageUrl(viewerIdentity)?.url,
    );
  });

  it("restores an unexpired signed URL after a module reload", async () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.resetModules();
    const initialCache = await import("./recipe-image-url-cache");
    const createUrl = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/persisted",
      expiresInSeconds: 3_600,
    }));
    await initialCache.getOrCreateRecipeImageUrl(identity, createUrl);
    expect(localStorage.length).toBe(1);

    vi.resetModules();
    expect(localStorage.length).toBe(1);
    const reloadedCache = await import("./recipe-image-url-cache");
    expect(reloadedCache.readCachedRecipeImageUrl(identity)).toBeDefined();
    const createAfterReload = vi.fn(async () => ({
      kind: "success" as const,
      url: "https://images.example/new",
      expiresInSeconds: 3_600,
    }));
    await reloadedCache.getOrCreateRecipeImageUrl(identity, createAfterReload);

    expect(createAfterReload).not.toHaveBeenCalled();
    expect(reloadedCache.readCachedRecipeImageUrl(identity)?.url).toBe(
      "https://images.example/persisted",
    );
    reloadedCache.clearRecipeImageUrlCache();
  });
});
