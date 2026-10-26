import { describe, expect, it } from "vitest";
import { recipeImagesFromRows } from "./recipe-images";
import type { Media, RecipeMedia } from "./zero/schema.gen";

const attachment: RecipeMedia = {
  id: "attachment",
  mediaId: "asset",
  householdId: "household",
  recipeId: "recipe",
  cookLogId: "log",
  sortKey: 100,
  deletedAt: null,
  createdAt: 10,
  updatedAt: 20,
};
const asset: Media = {
  id: "asset",
  householdId: "household",
  kind: "image",
  contentType: "image/webp",
  byteSize: 42,
  width: 800,
  height: 600,
  animated: null,
  durationMs: null,
  confirmedAt: 15,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 15,
};
describe("recipe image compatibility view", () => {
  it("preserves attachment identity, order and cooking context while reading asset metadata", () => {
    expect(recipeImagesFromRows([{ ...attachment, asset }])).toEqual([
      {
        ...attachment,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        width: 800,
        height: 600,
        confirmedAt: 15,
      },
    ]);
  });
  it("does not reinterpret unknown legacy animation metadata", () => {
    expect(recipeImagesFromRows([{ ...attachment, asset }])).toHaveLength(1);
    expect(asset.animated).toBeNull();
  });
  it("omits missing, unconfirmed, deleted and unsupported assets/attachments", () => {
    for (const patch of [
      { confirmedAt: null },
      { deletedAt: 50 },
      { kind: "video" },
    ]) {
      expect(
        recipeImagesFromRows([
          { ...attachment, asset: { ...asset, ...patch } },
        ]),
      ).toEqual([]);
    }
    expect(recipeImagesFromRows([{ ...attachment, asset: undefined }])).toEqual(
      [],
    );
    expect(
      recipeImagesFromRows([{ ...attachment, deletedAt: 40, asset }]),
    ).toEqual([]);
  });
});
