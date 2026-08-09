import { describe, expect, it } from "vitest";

import {
  createRecipeImageUploadRequestSchema,
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
