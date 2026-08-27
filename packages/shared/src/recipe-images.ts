import * as z from "zod";
import { recipeImageVariants } from "./recipe-image-delivery";

export const recipeImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const maxRecipeImageByteSize = 10_485_760;
export const maxRecipeImageDimension = 16_384;

export const recipeImageContentTypeSchema = z.enum(recipeImageContentTypes);

export type RecipeImageContentType = z.infer<
  typeof recipeImageContentTypeSchema
>;

export const createRecipeImageUploadRequestSchema = z
  .object({
    cookLogId: z.uuid().nullable(),
    contentType: recipeImageContentTypeSchema,
    byteSize: z.number().int().min(1).max(maxRecipeImageByteSize),
    width: z.number().int().min(1).max(maxRecipeImageDimension),
    height: z.number().int().min(1).max(maxRecipeImageDimension),
    position: z.number().int().nonnegative(),
  })
  .strict();

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
