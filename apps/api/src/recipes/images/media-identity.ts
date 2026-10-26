import {
  type MediaIdentity,
  mediaStorageIdentity,
} from "@home-hub/shared/media-delivery";

// Only call with the asset resolved through an authorized recipe attachment.
export function recipeImageMediaIdentity(input: {
  householdId: string;
  recipeId: string;
  imageId: string;
  mediaId: string;
  objectKey: string;
}): MediaIdentity {
  return {
    ...mediaStorageIdentity(input),
    moduleKey: "recipes",
    parentId: input.recipeId,
    attachmentId: input.imageId,
  };
}
