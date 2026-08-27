import {
  recipeImageProcessingCapabilityLifetimeSeconds,
  signRecipeImageProcessingCapability,
} from "@home-hub/shared/recipe-image-delivery";

export async function processRecipeImageDerivatives({
  baseUrl,
  fetchRequest = fetch,
  householdId,
  imageId,
  now = new Date(),
  recipeId,
  secret,
}: {
  baseUrl: string;
  fetchRequest?: typeof fetch;
  householdId: string;
  imageId: string;
  now?: Date;
  recipeId: string;
  secret: string;
}): Promise<void> {
  const capability = {
    expiresAt:
      Math.floor(now.getTime() / 1_000) +
      recipeImageProcessingCapabilityLifetimeSeconds,
    householdId,
    imageId,
    recipeId,
  };
  const signature = await signRecipeImageProcessingCapability({
    capability,
    secret,
  });
  const url = new URL(
    "internal/recipe-images/process",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  const response = await fetchRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...capability, signature }),
  });
  if (!response.ok) {
    throw new Error(`Image derivative processing failed (${response.status})`);
  }
}
