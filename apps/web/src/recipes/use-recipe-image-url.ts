import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { useMemo } from "react";
import { createUseImageUrl } from "../media/use-image-url";
import { createBatchedRecipeImageReadUrl } from "./recipe-image-read-url-batcher";
import {
  getOrCreateRecipeImageUrl,
  type RecipeImageUrlIdentity,
  readCachedRecipeImageUrl,
  recipeImageUrlCacheKey,
} from "./recipe-image-url-cache";

const useImageUrl = createUseImageUrl<RecipeImageUrlIdentity>({
  key: recipeImageUrlCacheKey,
  read: readCachedRecipeImageUrl,
  resolve: (identity) =>
    getOrCreateRecipeImageUrl(identity, () =>
      createBatchedRecipeImageReadUrl(identity),
    ),
});
export function useRecipeImageUrl({
  accessToken,
  userId,
  householdId,
  imageId,
  onSessionExpired,
  recipeId,
  variant,
}: {
  accessToken: string;
  userId: string;
  householdId: string;
  imageId: string | undefined;
  onSessionExpired: () => void;
  recipeId: string;
  variant: RecipeImageVariant;
}) {
  const identity = useMemo(
    () =>
      imageId
        ? { accessToken, userId, householdId, imageId, recipeId, variant }
        : undefined,
    [accessToken, userId, householdId, imageId, recipeId, variant],
  );
  return useImageUrl(identity, onSessionExpired);
}
