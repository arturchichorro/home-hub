import type { CreateRecipeImageReadUrlResult } from "./image-api";

type RecipeImageUrlIdentity = {
  accessToken: string;
  householdId: string;
  imageId: string;
  recipeId: string;
};

type CachedRecipeImageUrl = {
  refreshAt: number;
  resourceKey: string;
  url: string;
};

type PendingRecipeImageUrl = {
  promise: Promise<CreateRecipeImageReadUrlResult>;
  resourceKey: string;
};

const cachedUrls = new Map<string, CachedRecipeImageUrl>();
const pendingUrls = new Map<string, PendingRecipeImageUrl>();
const maximumRefreshBufferMs = 15_000;

function resourceKey({
  householdId,
  imageId,
  recipeId,
}: Omit<RecipeImageUrlIdentity, "accessToken">) {
  return JSON.stringify([householdId, recipeId, imageId]);
}

export function recipeImageUrlCacheKey(identity: RecipeImageUrlIdentity) {
  return JSON.stringify([
    identity.accessToken,
    identity.householdId,
    identity.recipeId,
    identity.imageId,
  ]);
}

export function readCachedRecipeImageUrl(
  identity: RecipeImageUrlIdentity,
  now = Date.now(),
) {
  const key = recipeImageUrlCacheKey(identity);
  const cached = cachedUrls.get(key);
  if (!cached) return undefined;
  if (cached.refreshAt <= now) {
    cachedUrls.delete(key);
    return undefined;
  }
  return cached;
}

export function getOrCreateRecipeImageUrl(
  identity: RecipeImageUrlIdentity,
  createUrl: () => Promise<CreateRecipeImageReadUrlResult>,
) {
  const cached = readCachedRecipeImageUrl(identity);
  if (cached) {
    return Promise.resolve({
      kind: "success" as const,
      url: cached.url,
      expiresInSeconds: Math.max(
        1,
        Math.ceil((cached.refreshAt - Date.now()) / 1_000),
      ),
    });
  }

  const key = recipeImageUrlCacheKey(identity);
  const pending = pendingUrls.get(key);
  if (pending) return pending.promise;

  const imageResourceKey = resourceKey(identity);
  const promise = createUrl()
    .then((result) => {
      if (
        result.kind === "success" &&
        pendingUrls.get(key)?.promise === promise
      ) {
        const lifetimeMs = result.expiresInSeconds * 1_000;
        const refreshBufferMs = Math.min(
          maximumRefreshBufferMs,
          lifetimeMs / 10,
        );
        cachedUrls.set(key, {
          refreshAt: Date.now() + lifetimeMs - refreshBufferMs,
          resourceKey: imageResourceKey,
          url: result.url,
        });
      }
      return result;
    })
    .finally(() => {
      if (pendingUrls.get(key)?.promise === promise) pendingUrls.delete(key);
    });

  pendingUrls.set(key, { promise, resourceKey: imageResourceKey });
  return promise;
}

export function invalidateRecipeImageUrl(
  identity: Omit<RecipeImageUrlIdentity, "accessToken">,
) {
  const imageResourceKey = resourceKey(identity);
  for (const [key, cached] of cachedUrls) {
    if (cached.resourceKey === imageResourceKey) cachedUrls.delete(key);
  }
  for (const [key, pending] of pendingUrls) {
    if (pending.resourceKey === imageResourceKey) pendingUrls.delete(key);
  }
}

export function clearRecipeImageUrlCache() {
  cachedUrls.clear();
  pendingUrls.clear();
}
