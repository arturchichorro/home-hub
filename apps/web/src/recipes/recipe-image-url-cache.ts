import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import type { CreateRecipeImageReadUrlResult } from "./image-api";

export type RecipeImageUrlIdentity = {
  accessToken: string;
  userId: string;
  householdId: string;
  imageId: string;
  recipeId: string;
  variant: RecipeImageVariant;
};

type CachedRecipeImageUrl = {
  refreshAt: number;
  resourceKey: string;
  url: string;
  userId: string;
};

type PendingRecipeImageUrl = {
  promise: Promise<CreateRecipeImageReadUrlResult>;
  resourceKey: string;
};

const cachedUrls = new Map<string, CachedRecipeImageUrl>();
const pendingUrls = new Map<string, PendingRecipeImageUrl>();
const hydratedUsers = new Set<string>();
const pendingPersistenceUsers = new Set<string>();
const maximumRefreshBufferMs = 15_000;
const storageKeyPrefix = "home-hub:recipe-image-urls:v1:";
let persistenceScheduled = false;

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function userStorageKey(userId: string) {
  return `${storageKeyPrefix}${userId}`;
}

function resourceKey({
  householdId,
  imageId,
  recipeId,
}: Omit<RecipeImageUrlIdentity, "accessToken" | "userId" | "variant">) {
  return JSON.stringify([householdId, recipeId, imageId]);
}

export function recipeImageUrlCacheKey(identity: RecipeImageUrlIdentity) {
  return JSON.stringify([
    identity.userId,
    identity.householdId,
    identity.recipeId,
    identity.imageId,
    identity.variant,
  ]);
}

function persistUserUrls(userId: string, now = Date.now()) {
  const storage = browserStorage();
  if (!storage) return;
  const entries = Array.from(cachedUrls.entries()).filter(
    ([, cached]) => cached.userId === userId && cached.refreshAt > now,
  );
  try {
    if (entries.length === 0) storage.removeItem(userStorageKey(userId));
    else storage.setItem(userStorageKey(userId), JSON.stringify(entries));
  } catch {
    // URL persistence is optional; memory caching still works.
  }
}

function schedulePersistUserUrls(userId: string) {
  pendingPersistenceUsers.add(userId);
  if (persistenceScheduled) return;
  persistenceScheduled = true;
  queueMicrotask(() => {
    persistenceScheduled = false;
    const userIds = Array.from(pendingPersistenceUsers);
    pendingPersistenceUsers.clear();
    for (const pendingUserId of userIds) persistUserUrls(pendingUserId);
  });
}

function hydrateUserUrls(userId: string, now = Date.now()) {
  if (hydratedUsers.has(userId)) return;
  hydratedUsers.add(userId);
  const storage = browserStorage();
  if (!storage) return;

  try {
    const stored = storage.getItem(userStorageKey(userId));
    if (!stored) return;
    const entries: unknown = JSON.parse(stored);
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [key, value] = entry;
      if (
        typeof key !== "string" ||
        !value ||
        typeof value !== "object" ||
        !("refreshAt" in value) ||
        !("resourceKey" in value) ||
        !("url" in value) ||
        !("userId" in value) ||
        typeof value.refreshAt !== "number" ||
        typeof value.resourceKey !== "string" ||
        typeof value.url !== "string" ||
        value.userId !== userId ||
        value.refreshAt <= now
      ) {
        continue;
      }
      cachedUrls.set(key, value as CachedRecipeImageUrl);
    }
    persistUserUrls(userId, now);
  } catch {
    storage.removeItem(userStorageKey(userId));
  }
}

export function readCachedRecipeImageUrl(
  identity: RecipeImageUrlIdentity,
  now = Date.now(),
) {
  hydrateUserUrls(identity.userId, now);
  const key = recipeImageUrlCacheKey(identity);
  const cached = cachedUrls.get(key);
  if (!cached) return undefined;
  if (cached.refreshAt <= now) {
    cachedUrls.delete(key);
    schedulePersistUserUrls(identity.userId);
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
          userId: identity.userId,
        });
        schedulePersistUserUrls(identity.userId);
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
  identity: Omit<RecipeImageUrlIdentity, "accessToken" | "variant">,
) {
  const imageResourceKey = resourceKey(identity);
  for (const [key, cached] of cachedUrls) {
    if (
      cached.userId === identity.userId &&
      cached.resourceKey === imageResourceKey
    ) {
      cachedUrls.delete(key);
    }
  }
  for (const [key, pending] of pendingUrls) {
    if (pending.resourceKey === imageResourceKey) pendingUrls.delete(key);
  }
  schedulePersistUserUrls(identity.userId);
}

export function clearRecipeImageUrlCache(userId?: string) {
  if (userId) {
    for (const [key, cached] of cachedUrls) {
      if (cached.userId === userId) cachedUrls.delete(key);
    }
    hydratedUsers.delete(userId);
  } else {
    cachedUrls.clear();
    hydratedUsers.clear();
  }
  pendingUrls.clear();
  if (userId) pendingPersistenceUsers.delete(userId);
  else pendingPersistenceUsers.clear();

  const storage = browserStorage();
  if (!storage) return;
  try {
    if (userId) {
      storage.removeItem(userStorageKey(userId));
      return;
    }
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(storageKeyPrefix)) storage.removeItem(key);
    }
  } catch {
    // Clearing memory is sufficient when storage is unavailable.
  }
}
