export const recipeImageVariants = ["card", "thumbnail", "viewer"] as const;

export type RecipeImageVariant = (typeof recipeImageVariants)[number];

export const recipeImageStoredVariants = ["thumbnail", "viewer"] as const;

export type RecipeImageStoredVariant =
  (typeof recipeImageStoredVariants)[number];

export const recipeImageVariantTransforms = {
  card: { width: 640, height: 427, fit: "cover" },
  thumbnail: { width: 768, fit: "scale-down" },
  viewer: { width: 1_920, fit: "scale-down" },
} as const satisfies Record<
  RecipeImageVariant,
  { width: number; height?: number; fit: "cover" | "scale-down" }
>;

export const recipeImageDeliveryCapabilityLifetimeSeconds = 3_600;
export const recipeImageProcessingCapabilityLifetimeSeconds = 300;

export type RecipeImageIdentity = {
  householdId: string;
  imageId: string;
  recipeId: string;
};

export function recipeImageOriginalObjectKey({
  householdId,
  imageId,
  recipeId,
}: RecipeImageIdentity): string {
  return `households/${householdId}/recipes/${recipeId}/${imageId}`;
}

export function recipeImageDerivativeObjectKey({
  householdId,
  imageId,
  recipeId,
  variant,
}: RecipeImageIdentity & { variant: RecipeImageStoredVariant }): string {
  return `${recipeImageOriginalObjectKey({ householdId, imageId, recipeId })}/derivatives/${variant}.webp`;
}

export type RecipeImageDeliveryCapability = {
  expiresAt: number;
  householdId: string;
  imageId: string;
  recipeId: string;
  variant: RecipeImageVariant;
};

export type RecipeImageProcessingCapability = RecipeImageIdentity & {
  expiresAt: number;
};

function capabilityPayload({
  expiresAt,
  householdId,
  imageId,
  recipeId,
  variant,
}: RecipeImageDeliveryCapability): string {
  return [
    "home-hub-recipe-image-v1",
    expiresAt,
    variant,
    householdId,
    recipeId,
    imageId,
  ].join("\n");
}

function processingCapabilityPayload({
  expiresAt,
  householdId,
  imageId,
  recipeId,
}: RecipeImageProcessingCapability): string {
  return [
    "home-hub-recipe-image-processing-v1",
    expiresAt,
    householdId,
    recipeId,
    imageId,
  ].join("\n");
}

async function importSigningKey(secret: string) {
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error("Image delivery signing secret must be at least 32 bytes");
  }

  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[0-9a-f]{64}$/u.test(hex)) return undefined;

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function signRecipeImageDeliveryCapability({
  capability,
  secret,
}: {
  capability: RecipeImageDeliveryCapability;
  secret: string;
}): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(capabilityPayload(capability)),
  );
  return bytesToHex(signature);
}

export async function verifyRecipeImageDeliveryCapability({
  capability,
  nowSeconds,
  secret,
  signature,
}: {
  capability: RecipeImageDeliveryCapability;
  nowSeconds: number;
  secret: string;
  signature: string;
}): Promise<boolean> {
  if (
    !Number.isInteger(capability.expiresAt) ||
    capability.expiresAt <= nowSeconds ||
    capability.expiresAt >
      nowSeconds + recipeImageDeliveryCapabilityLifetimeSeconds + 5
  ) {
    return false;
  }

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) return false;

  const key = await importSigningKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(capabilityPayload(capability)),
  );
}

export async function signRecipeImageProcessingCapability({
  capability,
  secret,
}: {
  capability: RecipeImageProcessingCapability;
  secret: string;
}): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(processingCapabilityPayload(capability)),
  );
  return bytesToHex(signature);
}

export async function verifyRecipeImageProcessingCapability({
  capability,
  nowSeconds,
  secret,
  signature,
}: {
  capability: RecipeImageProcessingCapability;
  nowSeconds: number;
  secret: string;
  signature: string;
}): Promise<boolean> {
  if (
    !Number.isInteger(capability.expiresAt) ||
    capability.expiresAt <= nowSeconds ||
    capability.expiresAt >
      nowSeconds + recipeImageProcessingCapabilityLifetimeSeconds + 5
  ) {
    return false;
  }

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) return false;

  const key = await importSigningKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(processingCapabilityPayload(capability)),
  );
}
