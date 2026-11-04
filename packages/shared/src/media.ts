import * as z from "zod";

// Recipe/exercise uploads remain still-image only. Moodboards additionally accept validated clips.
export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;
export const stillImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const stillImageContentTypeSchema = z.enum(stillImageContentTypes);
export type StillImageContentType = z.infer<typeof stillImageContentTypeSchema>;
export const videoContentTypeSchema = z.enum(["video/mp4", "video/webm"]);
export type VideoContentType = z.infer<typeof videoContentTypeSchema>;
export type MediaContentType = StillImageContentType | VideoContentType;
export const maxVideoByteSize = 100 * 1024 * 1024;
export const maxVideoDurationMs = 10 * 60 * 1000;
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
