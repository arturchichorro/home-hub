import { describe, expect, it } from "vitest";
import {
  recipeImageDeliveryCapabilityLifetimeSeconds,
  recipeImageDerivativeObjectKey,
  recipeImageOriginalObjectKey,
  recipeImageProcessingCapabilityLifetimeSeconds,
  signRecipeImageDeliveryCapability,
  signRecipeImageProcessingCapability,
  verifyRecipeImageDeliveryCapability,
  verifyRecipeImageProcessingCapability,
} from "./recipe-image-delivery";

const secret = "test-image-delivery-secret-at-least-32-bytes";
const nowSeconds = 1_787_625_600;
const capability = {
  expiresAt: nowSeconds + recipeImageDeliveryCapabilityLifetimeSeconds,
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  recipeId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  imageId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  variant: "card" as const,
};

describe("recipe image delivery capabilities", () => {
  it("verifies an untampered, unexpired capability", async () => {
    const signature = await signRecipeImageDeliveryCapability({
      capability,
      secret,
    });

    await expect(
      verifyRecipeImageDeliveryCapability({
        capability,
        nowSeconds,
        secret,
        signature,
      }),
    ).resolves.toBe(true);
  });

  it("rejects changed claims, malformed signatures, and expired capabilities", async () => {
    const signature = await signRecipeImageDeliveryCapability({
      capability,
      secret,
    });

    await expect(
      verifyRecipeImageDeliveryCapability({
        capability: { ...capability, variant: "viewer" },
        nowSeconds,
        secret,
        signature,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyRecipeImageDeliveryCapability({
        capability,
        nowSeconds,
        secret,
        signature: "not-a-signature",
      }),
    ).resolves.toBe(false);
    await expect(
      verifyRecipeImageDeliveryCapability({
        capability,
        nowSeconds: capability.expiresAt,
        secret,
        signature,
      }),
    ).resolves.toBe(false);
  });

  it("rejects secrets shorter than 32 bytes", async () => {
    await expect(
      signRecipeImageDeliveryCapability({ capability, secret: "too-short" }),
    ).rejects.toThrow("at least 32 bytes");
  });
});

describe("recipe image storage", () => {
  const identity = {
    householdId: capability.householdId,
    imageId: capability.imageId,
    recipeId: capability.recipeId,
  };

  it("uses deterministic original and derivative keys", () => {
    const original = recipeImageOriginalObjectKey(identity);
    expect(original).toBe(
      `households/${identity.householdId}/recipes/${identity.recipeId}/${identity.imageId}`,
    );
    expect(
      recipeImageDerivativeObjectKey({ ...identity, variant: "viewer" }),
    ).toBe(`${original}/derivatives/viewer.webp`);
  });

  it("signs short-lived processing capabilities independently from reads", async () => {
    const processingCapability = {
      ...identity,
      expiresAt: nowSeconds + recipeImageProcessingCapabilityLifetimeSeconds,
    };
    const signature = await signRecipeImageProcessingCapability({
      capability: processingCapability,
      secret,
    });

    await expect(
      verifyRecipeImageProcessingCapability({
        capability: processingCapability,
        nowSeconds,
        secret,
        signature,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyRecipeImageProcessingCapability({
        capability: { ...processingCapability, imageId: capability.recipeId },
        nowSeconds,
        secret,
        signature,
      }),
    ).resolves.toBe(false);
  });
});
