import {
  type RecipeImageVariant,
  recipeImageDeliveryCapabilityLifetimeSeconds,
  signRecipeImageDeliveryCapability,
} from "@home-hub/shared/recipe-image-delivery";

export const recipeImageReadUrlLifetimeSeconds =
  recipeImageDeliveryCapabilityLifetimeSeconds;

type SignRecipeImageReadInput = {
  baseUrl: string;
  householdId: string;
  imageId: string;
  now?: Date;
  recipeId: string;
  secret: string;
  variant: RecipeImageVariant;
};

export async function signRecipeImageRead({
  baseUrl,
  householdId,
  imageId,
  now = new Date(),
  recipeId,
  secret,
  variant,
}: SignRecipeImageReadInput): Promise<string> {
  const expiresAt =
    Math.floor(now.getTime() / 1_000) + recipeImageReadUrlLifetimeSeconds;
  const capability = {
    expiresAt,
    householdId,
    imageId,
    recipeId,
    variant,
  };
  const signature = await signRecipeImageDeliveryCapability({
    capability,
    secret,
  });
  const url = new URL(
    ["recipe-images", variant, householdId, recipeId, imageId]
      .map(encodeURIComponent)
      .join("/"),
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signature);
  return url.toString();
}
