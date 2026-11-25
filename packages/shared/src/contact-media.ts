import * as z from "zod";
import { stillImageContentTypeSchema, stillImageUploadSchema } from "./media";
import { mediaImageVariants } from "./media-delivery";
import type { ContactMedia, Media } from "./zero/schema.gen";

export const createContactMediaUploadSchema = stillImageUploadSchema;

export const contactMediaUploadResponseSchema = z
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

export const confirmContactMediaResponseSchema = z
  .object({
    attachment: z
      .object({ id: z.uuid(), confirmedAt: z.iso.datetime() })
      .strict(),
  })
  .strict();

export const contactMediaReadRequestSchema = z
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

export const contactMediaReadResponseSchema = z
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

export type ContactMediaImage = ContactMedia & { itemId: string } & Pick<
    Media,
    "contentType" | "byteSize" | "width" | "height" | "confirmedAt"
  >;

export function contactImagesFromRows(
  rows: readonly (ContactMedia & { asset?: Media | undefined })[],
): ContactMediaImage[] {
  return rows.flatMap(({ asset, ...attachment }) =>
    asset?.kind === "image" &&
    asset.confirmedAt !== null &&
    asset.deletedAt === null &&
    attachment.deletedAt === null
      ? [
          {
            ...attachment,
            itemId: attachment.parentId,
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
