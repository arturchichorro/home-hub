import * as z from "zod";
import { recipeImageVariants } from "./recipe-image-delivery";

export {
  maxStillImageByteSize as maxRecipeImageByteSize,
  maxStillImageDimension as maxRecipeImageDimension,
  stillImageContentTypeSchema as recipeImageContentTypeSchema,
  stillImageContentTypes as recipeImageContentTypes,
} from "./media";

import {
  stillImageContentTypeSchema as recipeImageContentTypeSchema,
  stillImageUploadSchema,
} from "./media";
import type { Media, RecipeMedia } from "./zero/schema.gen";

export type RecipeImageContentType = z.infer<
  typeof recipeImageContentTypeSchema
>;
export const createRecipeImageUploadRequestSchema = z
  .object({
    cookLogId: z.uuid().nullable(),
    ...stillImageUploadSchema.shape,
  })
  .strict();

// Recipe UI identity is the attachment ID, not the reusable asset ID.
export type RecipeImage = RecipeMedia &
  Pick<Media, "contentType" | "byteSize" | "confirmedAt" | "width" | "height">;
export function recipeImagesFromRows(
  rows: readonly (RecipeMedia & { asset?: Media | undefined })[],
): RecipeImage[] {
  return rows.flatMap(({ asset, ...attachment }) =>
    asset?.kind === "image" &&
    asset.confirmedAt !== null &&
    asset.deletedAt === null &&
    attachment.deletedAt === null
      ? [
          {
            ...attachment,
            contentType: asset.contentType,
            byteSize: asset.byteSize,
            confirmedAt: asset.confirmedAt,
            width: asset.width,
            height: asset.height,
          },
        ]
      : [],
  );
}

export type CreateRecipeImageUploadRequest = z.infer<
  typeof createRecipeImageUploadRequestSchema
>;

export const createRecipeImageUploadResponseSchema = z
  .object({
    imageId: z.uuid(),
    upload: z
      .object({
        url: z.url(),
        expiresInSeconds: z.number().int().positive(),
        requiredHeaders: z
          .object({
            "Content-Type": recipeImageContentTypeSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type CreateRecipeImageUploadResponse = z.infer<
  typeof createRecipeImageUploadResponseSchema
>;

export const confirmRecipeImageUploadResponseSchema = z
  .object({
    image: z
      .object({
        id: z.uuid(),
        confirmedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type ConfirmRecipeImageUploadResponse = z.infer<
  typeof confirmRecipeImageUploadResponseSchema
>;

export const recipeImageVariantSchema = z.enum(recipeImageVariants);

export const createRecipeImageReadUrlRequestSchema = z
  .object({ variant: recipeImageVariantSchema })
  .strict();

export type CreateRecipeImageReadUrlRequest = z.infer<
  typeof createRecipeImageReadUrlRequestSchema
>;

export const createRecipeImageReadUrlResponseSchema = z
  .object({
    read: z
      .object({
        url: z.url(),
        expiresInSeconds: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type CreateRecipeImageReadUrlResponse = z.infer<
  typeof createRecipeImageReadUrlResponseSchema
>;

export const createRecipeImageReadUrlsRequestSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            imageId: z.uuid(),
            recipeId: z.uuid(),
            variant: recipeImageVariantSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type CreateRecipeImageReadUrlsRequest = z.infer<
  typeof createRecipeImageReadUrlsRequestSchema
>;

export const createRecipeImageReadUrlsResponseSchema = z
  .object({
    reads: z.array(
      z
        .object({
          imageId: z.uuid(),
          recipeId: z.uuid(),
          variant: recipeImageVariantSchema,
          url: z.url(),
          expiresInSeconds: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export type CreateRecipeImageReadUrlsResponse = z.infer<
  typeof createRecipeImageReadUrlsResponseSchema
>;
