import * as z from "zod";
import { stillImageContentTypeSchema, stillImageUploadSchema } from "./media";
import { mediaImageVariants } from "./media-delivery";
import type { CalendarMedia, Media } from "./zero/schema.gen";

export const createCalendarMediaUploadSchema = stillImageUploadSchema;

export const calendarMediaUploadResponseSchema = z
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

export const confirmCalendarMediaResponseSchema = z
  .object({
    attachment: z
      .object({ id: z.uuid(), confirmedAt: z.iso.datetime() })
      .strict(),
  })
  .strict();

export const calendarMediaReadRequestSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            attachmentId: z.uuid(),
            variant: z.enum(mediaImageVariants),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const calendarMediaReadResponseSchema = z
  .object({
    reads: z.array(
      z
        .object({
          itemId: z.uuid(),
          attachmentId: z.uuid(),
          variant: z.enum(mediaImageVariants),
          url: z.url(),
          expiresInSeconds: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export type CalendarMediaImage = CalendarMedia &
  Pick<Media, "contentType" | "byteSize" | "width" | "height" | "confirmedAt">;

export function calendarImagesFromRows(
  rows: readonly (CalendarMedia & { asset?: Media | undefined })[],
): CalendarMediaImage[] {
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
