import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { createImageUrlCache } from "../media/create-image-url-cache";
export type RecipeImageUrlIdentity = {
  accessToken: string;
  userId: string;
  householdId: string;
  imageId: string;
  recipeId: string;
  variant: RecipeImageVariant;
};
const cache = createImageUrlCache<RecipeImageUrlIdentity>({
  storageKeyPrefix: "home-hub:recipe-image-urls:v1:",
  resourceKey: ({ householdId, recipeId, imageId }) =>
    JSON.stringify([householdId, recipeId, imageId]),
  cacheKey: ({ userId, householdId, recipeId, imageId, variant }) =>
    JSON.stringify([userId, householdId, recipeId, imageId, variant]),
});
export const recipeImageUrlCacheKey = cache.key;
export const readCachedRecipeImageUrl = cache.read;
export const getOrCreateRecipeImageUrl = cache.getOrCreate;
export const invalidateRecipeImageUrl = cache.invalidate;
export const clearRecipeImageUrlCache = cache.clear;
