import { describe, expect, it } from "vitest";

import {
  confirmRecipeImageUploadResponseSchema,
  createRecipeImageReadUrlRequestSchema,
  createRecipeImageReadUrlResponseSchema,
  createRecipeImageReadUrlsRequestSchema,
  createRecipeImageUploadRequestSchema,
  createRecipeImageUploadResponseSchema,
  maxRecipeImageByteSize,
  maxRecipeImageDimension,
  recipeImageContentTypes,
} from "./recipe-images";

const cookLogId = "5944cb0d-931a-4723-b981-77eacb122314";

const input = {
  cookLogId: null,
  contentType: "image/jpeg" as const,
  byteSize: 1_024,
  width: 800,
  height: 600,
  position: 0,
};

describe("createRecipeImageUploadRequestSchema", () => {
  it.each(recipeImageContentTypes)(
    "accepts the supported type %s",
    (contentType) => {
      expect(
        createRecipeImageUploadRequestSchema.parse({ ...input, contentType }),
      ).toEqual({ ...input, contentType });
    },
  );

  it("accepts an image associated with a cooking log", () => {
    expect(
      createRecipeImageUploadRequestSchema.parse({ ...input, cookLogId }),
    ).toEqual({ ...input, cookLogId });
  });

  it.each([
    ["cookLogId", undefined],
    ["cookLogId", "not-a-uuid"],
    ["contentType", "image/gif"],
    ["byteSize", 0],
    ["byteSize", maxRecipeImageByteSize + 1],
    ["byteSize", 1.5],
    ["width", 0],
    ["width", maxRecipeImageDimension + 1],
    ["width", 1.5],
    ["height", 0],
    ["height", maxRecipeImageDimension + 1],
    ["height", 1.5],
    ["position", -1],
    ["position", 1.5],
  ] as const)("rejects invalid %s %j", (field, value) => {
    expect(
      createRecipeImageUploadRequestSchema.safeParse({
        ...input,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      createRecipeImageUploadRequestSchema.safeParse({
        ...input,
        objectKey: "user-controlled-key",
      }).success,
    ).toBe(false);
  });
});

describe("recipe image HTTP response schemas", () => {
  const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

  it("validates pending upload instructions", () => {
    const response = {
      imageId,
      upload: {
        url: "https://upload.example/image",
        expiresInSeconds: 300,
        requiredHeaders: { "Content-Type": "image/webp" },
      },
    };

    expect(createRecipeImageUploadResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it("validates confirmation metadata", () => {
    const response = {
      image: { id: imageId, confirmedAt: "2026-08-10T12:00:00.000Z" },
    };

    expect(confirmRecipeImageUploadResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it("validates signed read instructions", () => {
    const response = {
      read: { url: "https://read.example/image", expiresInSeconds: 300 },
    };

    expect(createRecipeImageReadUrlResponseSchema.parse(response)).toEqual(
      response,
    );
  });
});

describe("createRecipeImageReadUrlRequestSchema", () => {
  it.each(["card", "thumbnail", "viewer"] as const)(
    "accepts the fixed %s variant",
    (variant) => {
      expect(createRecipeImageReadUrlRequestSchema.parse({ variant })).toEqual({
        variant,
      });
    },
  );

  it("rejects original and arbitrary variants", () => {
    expect(
      createRecipeImageReadUrlRequestSchema.safeParse({ variant: "original" })
        .success,
    ).toBe(false);
    expect(
      createRecipeImageReadUrlRequestSchema.safeParse({
        variant: "width-1234",
      }).success,
    ).toBe(false);
  });
});

describe("createRecipeImageReadUrlsRequestSchema", () => {
  const request = {
    imageId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
    recipeId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
    variant: "thumbnail" as const,
  };

  it("accepts up to 100 fixed-variant requests", () => {
    const requests = Array.from({ length: 100 }, () => request);
    expect(createRecipeImageReadUrlsRequestSchema.parse({ requests })).toEqual({
      requests,
    });
  });

  it("rejects empty, oversized, and arbitrary-variant batches", () => {
    expect(
      createRecipeImageReadUrlsRequestSchema.safeParse({ requests: [] })
        .success,
    ).toBe(false);
    expect(
      createRecipeImageReadUrlsRequestSchema.safeParse({
        requests: Array.from({ length: 101 }, () => request),
      }).success,
    ).toBe(false);
    expect(
      createRecipeImageReadUrlsRequestSchema.safeParse({
        requests: [{ ...request, variant: "original" }],
      }).success,
    ).toBe(false);
  });
});
