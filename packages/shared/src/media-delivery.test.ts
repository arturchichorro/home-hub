import { describe, expect, it } from "vitest";
import { stillImageUploadSchema } from "./media";
import {
  mediaOriginalObjectKey,
  mediaReadCapabilitySchema,
  mediaStorageIdentity,
  signMediaCapability,
  verifyMediaCapability,
} from "./media-delivery";

const secret = "a-shared-media-test-secret-of-at-least-32-bytes";
const nowSeconds = 1_787_625_600;
const identity = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  mediaId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  storageRecipeId: null,
  moduleKey: "recipes",
  parentId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  attachmentId: "5944cb0d-931a-4723-b981-77eacb122314",
};
const capability = {
  ...identity,
  expiresAt: nowSeconds + 3600,
  variant: "thumbnail" as const,
};

describe("media capabilities", () => {
  it("signs a canonical capability independent of property insertion order", async () => {
    const signature = await signMediaCapability({
      capability,
      secret,
      purpose: "read",
    });
    const reordered = Object.fromEntries(
      Object.entries(capability).reverse(),
    ) as typeof capability;
    expect(
      await verifyMediaCapability({
        capability: reordered,
        signature,
        secret,
        purpose: "read",
        nowSeconds,
      }),
    ).toBe(true);
  });
  it.each([
    { householdId: identity.mediaId },
    { mediaId: identity.parentId },
    { storageRecipeId: identity.parentId },
    { moduleKey: "workouts" },
    { parentId: identity.mediaId },
    { attachmentId: identity.mediaId },
    { variant: "viewer" as const },
    { expiresAt: nowSeconds + 3599 },
  ])(
    "authenticates every identity, context and delivery field: %o",
    async (patch) => {
      const signature = await signMediaCapability({
        capability,
        secret,
        purpose: "read",
      });
      expect(
        await verifyMediaCapability({
          capability: { ...capability, ...patch },
          signature,
          secret,
          purpose: "read",
          nowSeconds,
        }),
      ).toBe(false);
    },
  );
  it("rejects expired, excessive-lifetime, malformed and wrong-purpose capabilities", async () => {
    const signature = await signMediaCapability({
      capability,
      secret,
      purpose: "read",
    });
    const verify = (patch = {}) =>
      verifyMediaCapability({
        capability,
        signature,
        secret,
        purpose: "read",
        nowSeconds,
        ...patch,
      });
    expect(await verify({ nowSeconds: capability.expiresAt })).toBe(false);
    expect(await verify({ nowSeconds: nowSeconds - 10 })).toBe(false);
    expect(await verify({ signature: "not-a-signature" })).toBe(false);
    expect(
      await verifyMediaCapability({
        capability,
        signature,
        secret,
        purpose: "process",
        nowSeconds,
      }),
    ).toBe(false);
    expect(
      mediaReadCapabilitySchema.safeParse({
        ...capability,
        objectKey: "arbitrary",
      }).success,
    ).toBe(false);
    expect(
      mediaReadCapabilitySchema.safeParse({
        ...capability,
        variant: "original",
      }).success,
    ).toBe(false);
  });
  it("separately authenticates image processing type and size", async () => {
    const processing = {
      ...identity,
      expiresAt: nowSeconds + 300,
      contentType: "image/webp" as const,
      byteSize: 42,
    };
    const signature = await signMediaCapability({
      capability: processing,
      secret,
      purpose: "process",
    });
    for (const patch of [
      {},
      { byteSize: 43 },
      { contentType: "image/png" as const },
    ]) {
      expect(
        await verifyMediaCapability({
          capability: { ...processing, ...patch },
          signature,
          secret,
          purpose: "process",
          nowSeconds,
        }),
      ).toBe(Object.keys(patch).length === 0);
    }
  });
});

describe("media storage and initial upload scope", () => {
  it.each([null, identity.attachmentId])(
    "resolves generic and legacy storage without moving objects: %s",
    (storageRecipeId) => {
      const source = { ...identity, storageRecipeId };
      const objectKey = mediaOriginalObjectKey(source);
      expect(mediaStorageIdentity({ ...identity, objectKey })).toEqual({
        householdId: identity.householdId,
        mediaId: identity.mediaId,
        storageRecipeId,
      });
    },
  );
  it("rejects foreign identities and arbitrary storage paths", () => {
    for (const objectKey of [
      "some/private/object",
      mediaOriginalObjectKey({ ...identity, householdId: identity.parentId }),
      mediaOriginalObjectKey({ ...identity, mediaId: identity.parentId }),
      `${mediaOriginalObjectKey(identity)}/derivatives/viewer.webp`,
    ])
      expect(() => mediaStorageIdentity({ ...identity, objectKey })).toThrow();
  });
  it.each(["video/mp4", "video/webm", "image/gif", "image/svg+xml"])(
    "does not enable unsupported uploads: %s",
    (contentType) => {
      expect(
        stillImageUploadSchema.safeParse({
          contentType,
          byteSize: 42,
          width: 10,
          height: 10,
        }).success,
      ).toBe(false);
    },
  );
});
