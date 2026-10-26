import * as z from "zod";

// The identity model includes video; upload/delivery deliberately remain still-image only.
export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;
export const stillImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const stillImageContentTypeSchema = z.enum(stillImageContentTypes);
export type StillImageContentType = z.infer<typeof stillImageContentTypeSchema>;
export const maxStillImageByteSize = 10_485_760;
export const maxStillImageDimension = 16_384;

export const stillImageUploadSchema = z
  .object({
    contentType: stillImageContentTypeSchema,
    byteSize: z.number().int().min(1).max(maxStillImageByteSize),
    width: z.number().int().min(1).max(maxStillImageDimension),
    height: z.number().int().min(1).max(maxStillImageDimension),
  })
  .strict();
