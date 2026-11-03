import * as z from "zod";
import { listDetailArgsSchema } from "./lists";
import {
  maxVideoByteSize,
  stillImageUploadSchema,
  videoContentTypeSchema,
} from "./media";
export const createListMediaUploadSchema = z.union([
  stillImageUploadSchema,
  z
    .object({
      contentType: videoContentTypeSchema,
      byteSize: z.number().int().min(1).max(maxVideoByteSize),
      width: z.number().int().min(1).max(4096),
      height: z.number().int().min(1).max(4096),
    })
    .strict(),
]);
export const listMediaReadRequestSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            listId: z.uuid(),
            attachmentId: z.uuid(),
            variant: z.enum(["thumbnail", "viewer", "video"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const listMediaUploadResponseSchema = z
  .object({
    attachmentId: z.uuid(),
    upload: z
      .object({
        url: z.url(),
        expiresInSeconds: z.number().int().positive(),
        requiredHeaders: z
          .object({
            "Content-Type": z.enum([
              "image/jpeg",
              "image/png",
              "image/webp",
              "video/mp4",
              "video/webm",
            ]),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export const confirmListMediaResponseSchema = z
  .object({
    attachment: z
      .object({ id: z.uuid(), confirmedAt: z.iso.datetime() })
      .strict(),
  })
  .strict();
export const listMediaReadResponseSchema = z
  .object({
    reads: z.array(
      z
        .object({
          listId: z.uuid(),
          attachmentId: z.uuid(),
          variant: z.enum(["thumbnail", "viewer", "video"]),
          url: z.url(),
          expiresInSeconds: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();
export const listMediaPageSchema = listDetailArgsSchema
  .extend({ limit: z.number().int().min(1).max(10001) })
  .strict();
export const reorderListMediaSchema = listDetailArgsSchema
  .extend({
    attachmentId: z.uuid(),
    previousId: z.uuid().nullable(),
    nextId: z.uuid().nullable(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (a) =>
      new Set([
        a.attachmentId,
        ...(a.previousId ? [a.previousId] : []),
        ...(a.nextId ? [a.nextId] : []),
      ]).size ===
      1 + Number(!!a.previousId) + Number(!!a.nextId),
    "Reorder IDs must differ",
  );
