import * as z from "zod";

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
