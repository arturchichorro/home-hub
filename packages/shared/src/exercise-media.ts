import * as z from "zod";
import { stillImageContentTypeSchema, stillImageUploadSchema } from "./media";
import { mediaImageVariants } from "./media-delivery";
import type { ExerciseMedia, Media } from "./zero/schema.gen";

export const reorderExerciseMediaSchema = z
  .object({
    householdId: z.uuid(),
    exerciseId: z.uuid(),
    attachmentId: z.uuid(),
    orderedAttachmentIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Attachment IDs must be unique",
      ),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (args) => args.orderedAttachmentIds.includes(args.attachmentId),
    "Order must include the moved attachment",
  );

export const createExerciseMediaUploadSchema = stillImageUploadSchema;
export const exerciseMediaUploadResponseSchema = z
  .object({
    attachmentId: z.uuid(),
    upload: z
      .object({
        url: z.url(),
        expiresInSeconds: z.number().int().positive(),
        requiredHeaders: z
          .object({ "Content-Type": stillImageContentTypeSchema })
          .strict(),
      })
      .strict(),
  })
  .strict();
export const confirmExerciseMediaResponseSchema = z
  .object({
    attachment: z
      .object({ id: z.uuid(), confirmedAt: z.iso.datetime() })
      .strict(),
  })
  .strict();
export const exerciseMediaReadRequestSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            exerciseId: z.uuid(),
            attachmentId: z.uuid(),
            variant: z.enum(mediaImageVariants),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const exerciseMediaReadResponseSchema = z
  .object({
    reads: z.array(
      z
        .object({
          exerciseId: z.uuid(),
          attachmentId: z.uuid(),
          variant: z.enum(mediaImageVariants),
          url: z.url(),
          expiresInSeconds: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();
export type ExerciseMediaImage = ExerciseMedia &
  Pick<Media, "contentType" | "byteSize" | "width" | "height" | "confirmedAt">;
export function exerciseImagesFromRows(
  rows: readonly (ExerciseMedia & { asset?: Media | undefined })[],
): ExerciseMediaImage[] {
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
            width: asset.width,
            height: asset.height,
            confirmedAt: asset.confirmedAt,
          },
        ]
      : [],
  );
}
