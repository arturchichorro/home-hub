import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { useEffect, useState } from "react";
import { createBatchedRecipeImageReadUrl } from "./recipe-image-read-url-batcher";
import {
  getOrCreateRecipeImageUrl,
  readCachedRecipeImageUrl,
  recipeImageUrlCacheKey,
} from "./recipe-image-url-cache";

type UseRecipeImageUrlOptions = {
  accessToken: string;
  userId: string;
  householdId: string;
  imageId: string | undefined;
  onSessionExpired: () => void;
  recipeId: string;
  variant: RecipeImageVariant;
};

type RecipeImageUrlState = {
  error: boolean;
  loading: boolean;
  url: string | undefined;
};

type InternalRecipeImageUrlState = {
  error: boolean;
  key: string | undefined;
  url: string | undefined;
};

export function useRecipeImageUrl({
  accessToken,
  userId,
  householdId,
  imageId,
  onSessionExpired,
  recipeId,
  variant,
}: UseRecipeImageUrlOptions): RecipeImageUrlState {
  const identity = imageId
    ? { accessToken, userId, householdId, imageId, recipeId, variant }
    : undefined;
  const key = identity ? recipeImageUrlCacheKey(identity) : undefined;
  const cached = identity ? readCachedRecipeImageUrl(identity) : undefined;
  const [state, setState] = useState<InternalRecipeImageUrlState>(() => ({
    error: false,
    key,
    url: cached?.url,
  }));
  const stateMatches = state.key === key;
  const url = cached?.url ?? (stateMatches ? state.url : undefined);
  const error = stateMatches ? state.error : false;

  useEffect(() => {
    let active = true;
    let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

    if (!imageId) {
      setState({ error: false, key: undefined, url: undefined });
      return () => undefined;
    }

    const currentIdentity = {
      accessToken,
      userId,
      householdId,
      imageId,
      recipeId,
      variant,
    };
    const currentKey = recipeImageUrlCacheKey(currentIdentity);

    function scheduleRefresh(refreshAt: number) {
      refreshTimeout = setTimeout(
        () => void loadUrl(),
        Math.max(0, refreshAt - Date.now()),
      );
    }

    async function loadUrl() {
      const currentCached = readCachedRecipeImageUrl(currentIdentity);
      if (currentCached) {
        if (active) {
          setState({ error: false, key: currentKey, url: currentCached.url });
          scheduleRefresh(currentCached.refreshAt);
        }
        return;
      }

      if (active) setState({ error: false, key: currentKey, url: undefined });

      const result = await getOrCreateRecipeImageUrl(currentIdentity, () =>
        createBatchedRecipeImageReadUrl(currentIdentity),
      );
      if (!active) return;

      if (result.kind === "success") {
        setState({ error: false, key: currentKey, url: result.url });
        const nextCached = readCachedRecipeImageUrl(currentIdentity);
        if (nextCached) scheduleRefresh(nextCached.refreshAt);
      } else if (result.kind === "unauthorized") {
        onSessionExpired();
      } else {
        setState({ error: true, key: currentKey, url: undefined });
      }
    }

    void loadUrl().catch(() => {
      if (active) setState({ error: true, key: currentKey, url: undefined });
    });

    return () => {
      active = false;
      if (refreshTimeout !== undefined) clearTimeout(refreshTimeout);
    };
  }, [
    accessToken,
    householdId,
    imageId,
    onSessionExpired,
    recipeId,
    userId,
    variant,
  ]);

  return {
    error,
    loading: Boolean(imageId) && !url && !error,
    url,
  };
}
