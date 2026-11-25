import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "@home-hub/database";
import {
  contactEntries,
  contactMedia,
  contacts,
  media,
} from "@home-hub/database/schema";
import { stillImageUploadSchema } from "@home-hub/shared/media";
import {
  type MediaIdentity,
  mediaOriginalObjectKey,
  mediaReadLifetimeSeconds,
  mediaStorageIdentity,
} from "@home-hub/shared/media-delivery";
import { appendSortKey } from "@home-hub/shared/ordering";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { CalendarMediaDependencies } from "../calendar/media";
import { InvalidMediaUploadError } from "../media/process-image";
import { mediaUploadUrlLifetimeSeconds } from "../media/sign-upload";
import { authorizeContacts, ContactsError, entryWritable } from "./records";

type Scope = { userId: string; householdId: string; itemId: string };

type AttachmentScope = Scope & { attachmentId: string };

export type ContactMediaKind = "profile" | "entry";

function contactMediaRecords(kind: ContactMediaKind) {
  async function parent(tx: DatabaseTransaction, input: Scope, write: boolean) {
    if (kind === "profile") {
      const [row] = await tx
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.householdId, input.householdId),
            eq(contacts.id, input.itemId),
          ),
        )
        .for(write ? "update" : "share");
      if (!row) {
        throw new ContactsError(404, "Contact unavailable");
      }
      if (write && row.archived) {
        throw new ContactsError(422, "Restore this contact first");
      }
    } else {
      const [row] = await tx
        .select()
        .from(contactEntries)
        .where(
          and(
            eq(contactEntries.householdId, input.householdId),
            eq(contactEntries.id, input.itemId),
            isNull(contactEntries.deletedAt),
          ),
        )
        .for(write ? "update" : "share");
      if (!row) {
        throw new ContactsError(404, "Entry unavailable");
      }
      if (write && !(await entryWritable(tx, input.householdId, row.id))) {
        throw new ContactsError(422, "Restore a linked contact first");
      }
    }
  }
  function attachment(tx: DatabaseTransaction, input: AttachmentScope) {
    return tx
      .select({ attachment: contactMedia, asset: media })
      .from(contactMedia)
      .innerJoin(
        media,
        and(
          eq(media.id, contactMedia.mediaId),
          eq(media.householdId, contactMedia.householdId),
        ),
      )
      .where(
        and(
          eq(contactMedia.id, input.attachmentId),
          eq(contactMedia.householdId, input.householdId),
          eq(contactMedia.parentId, input.itemId),
          eq(
            kind === "profile" ? contactMedia.contactId : contactMedia.entryId,
            input.itemId,
          ),
          isNull(contactMedia.deletedAt),
          isNull(media.deletedAt),
          eq(media.kind, "image"),
        ),
      )
      .limit(1);
  }
  function identity(row: {
    attachment: typeof contactMedia.$inferSelect;
    asset: typeof media.$inferSelect;
  }): MediaIdentity {
    return {
      ...mediaStorageIdentity({
        householdId: row.asset.householdId,
        mediaId: row.asset.id,
        objectKey: row.asset.objectKey,
      }),
      moduleKey: "contacts",
      parentId: row.attachment.parentId,
      attachmentId: row.attachment.id,
    };
  }
  async function bump(tx: DatabaseTransaction, input: Scope, publish = false) {
    const date = new Date();
    if (kind === "profile") {
      const [row] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.itemId));
      if (!row) {
        throw new ContactsError(404, "Contact unavailable");
      }
      await tx
        .update(contacts)
        .set({ version: row.version + 1, updatedAt: date })
        .where(eq(contacts.id, row.id));
    } else {
      const [row] = await tx
        .select()
        .from(contactEntries)
        .where(eq(contactEntries.id, input.itemId));
      if (!row) {
        throw new ContactsError(404, "Entry unavailable");
      }
      await tx
        .update(contactEntries)
        .set({
          version: row.version + 1,
          updatedAt: date,
          lastEditedBy: input.userId,
          ...(publish ? { published: true } : {}),
        })
        .where(eq(contactEntries.id, row.id));
    }
  }
  return { parent, attachment, identity, bump };
}

export async function removeContactAttachment(
  tx: DatabaseTransaction,
  input: AttachmentScope,
  kind: ContactMediaKind,
) {
  const { parent, attachment, bump } = contactMediaRecords(kind);
  await authorizeContacts(tx, input, true);
  await parent(tx, input, true);
  const row = (await attachment(tx, input))[0];
  if (!row) {
    return { kind: "success" as const };
  }
  if (kind === "entry" && row.attachment.published) {
    const [entry] = await tx
      .select()
      .from(contactEntries)
      .where(eq(contactEntries.id, input.itemId));
    if (!entry) {
      throw new ContactsError(404, "Entry unavailable");
    }
    const [other] = await tx
      .select({ id: contactMedia.id })
      .from(contactMedia)
      .where(
        and(
          eq(contactMedia.entryId, entry.id),
          ne(contactMedia.id, row.attachment.id),
          eq(contactMedia.published, true),
          isNull(contactMedia.deletedAt),
        ),
      )
      .limit(1);
    if (!entry.note.trim() && !other) {
      throw new ContactsError(
        422,
        "This is the entry's last content. Delete the entry everywhere instead.",
      );
    }
  }
  await tx
    .update(contactMedia)
    .set({
      deletedAt: new Date(),
      published: false,
      updatedAt: new Date(),
    })
    .where(eq(contactMedia.id, row.attachment.id));
  await bump(tx, input);
  return { kind: "success" as const };
}

export function createContactMediaServices(
  deps: CalendarMediaDependencies,
  kind: ContactMediaKind,
) {
  const { db, signUpload, inspectObject, processImage, signRead } = deps;
  const { parent, attachment, identity, bump } = contactMediaRecords(kind);
  return {
    async createUpload(
      input: Scope & {
        contentType: "image/jpeg" | "image/png" | "image/webp";
        byteSize: number;
        width: number;
        height: number;
      },
    ) {
      const metadata = stillImageUploadSchema.parse({
        contentType: input.contentType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
      });
      return db.transaction(async (tx) => {
        await authorizeContacts(tx, input, true);
        await parent(tx, input, true);
        const [bottom] = await tx
          .select({ sortKey: contactMedia.sortKey })
          .from(contactMedia)
          .where(
            and(
              eq(contactMedia.householdId, input.householdId),
              eq(contactMedia.parentId, input.itemId),
              isNull(contactMedia.deletedAt),
            ),
          )
          .orderBy(asc(contactMedia.sortKey), contactMedia.id)
          .limit(1);
        const mediaId = randomUUID();
        const attachmentId = randomUUID();
        const objectKey = mediaOriginalObjectKey({
          householdId: input.householdId,
          mediaId,
          storageRecipeId: null,
        });
        await tx.insert(media).values({
          id: mediaId,
          householdId: input.householdId,
          kind: "image",
          objectKey,
          ...metadata,
        });
        await tx.insert(contactMedia).values({
          id: attachmentId,
          householdId: input.householdId,
          parentId: input.itemId,
          mediaId,
          contactId: kind === "profile" ? input.itemId : null,
          entryId: kind === "entry" ? input.itemId : null,
          sortKey: appendSortKey(bottom?.sortKey),
        });
        return {
          kind: "success" as const,
          attachmentId,
          upload: {
            url: await signUpload({
              objectKey,
              contentType: metadata.contentType,
            }),
            expiresInSeconds: mediaUploadUrlLifetimeSeconds,
            requiredHeaders: { "Content-Type": metadata.contentType },
          },
        };
      });
    },
    async confirmUpload(input: AttachmentScope) {
      const initial = await db.transaction(async (tx) => {
        await authorizeContacts(tx, input);
        await parent(tx, input, true);
        return (await attachment(tx, input))[0];
      });
      if (!initial) {
        throw new ContactsError(404, "Picture unavailable");
      }
      if (initial.asset.confirmedAt && initial.attachment.published) {
        return {
          kind: "success" as const,
          attachment: {
            id: initial.attachment.id,
            confirmedAt: initial.asset.confirmedAt,
          },
        };
      }
      const object = await inspectObject({
        objectKey: initial.asset.objectKey,
      });
      if (!object) {
        return { kind: "upload_not_found" as const };
      }
      if (
        object.byteSize !== initial.asset.byteSize ||
        object.contentType !== initial.asset.contentType
      ) {
        return { kind: "invalid_upload" as const };
      }
      try {
        await processImage({
          identity: identity(initial),
          contentType: stillImageUploadSchema.shape.contentType.parse(
            initial.asset.contentType,
          ),
          byteSize: initial.asset.byteSize,
        });
      } catch (error) {
        if (error instanceof InvalidMediaUploadError) {
          return { kind: "invalid_upload" as const };
        }
        throw error;
      }
      return db.transaction(async (tx) => {
        await authorizeContacts(tx, input, true);
        await parent(tx, input, true);
        const row = (await attachment(tx, input))[0];
        if (
          !row ||
          row.asset.id !== initial.asset.id ||
          row.asset.objectKey !== initial.asset.objectKey ||
          row.asset.contentType !== initial.asset.contentType ||
          row.asset.byteSize !== initial.asset.byteSize
        ) {
          throw new ContactsError(404, "Picture unavailable");
        }
        if (row.asset.confirmedAt && row.attachment.published) {
          return {
            kind: "success" as const,
            attachment: {
              id: row.attachment.id,
              confirmedAt: row.asset.confirmedAt,
            },
          };
        }
        const date = new Date();
        if (kind === "profile") {
          await tx
            .update(contactMedia)
            .set({ published: false, deletedAt: date, updatedAt: date })
            .where(
              and(
                eq(contactMedia.contactId, input.itemId),
                ne(contactMedia.id, row.attachment.id),
                eq(contactMedia.published, true),
                isNull(contactMedia.deletedAt),
              ),
            );
        }
        await tx
          .update(media)
          .set({ confirmedAt: date, animated: false, updatedAt: date })
          .where(eq(media.id, row.asset.id));
        await tx
          .update(contactMedia)
          .set({ published: true, updatedAt: date })
          .where(eq(contactMedia.id, row.attachment.id));
        await bump(tx, input, true);
        return {
          kind: "success" as const,
          attachment: { id: row.attachment.id, confirmedAt: date },
        };
      });
    },
    async deleteAttachment(input: AttachmentScope) {
      return db.transaction((tx) => removeContactAttachment(tx, input, kind));
    },
    async readUrls(
      input: Pick<Scope, "userId" | "householdId"> & {
        requests: {
          itemId: string;
          attachmentId: string;
          variant: "thumbnail" | "viewer" | "card";
        }[];
      },
    ) {
      const requests = [
        ...new Map(input.requests.map((q) => [JSON.stringify(q), q])).values(),
      ];
      if (!requests.length || requests.length > 100) {
        throw new ContactsError(422, "Invalid batch");
      }
      const readable = await db.transaction(async (tx) => {
        await authorizeContacts(tx, input);
        const rows: {
          request: (typeof requests)[number];
          identity: MediaIdentity;
        }[] = [];
        for (const request of [...requests].sort((a, b) =>
          a.itemId.localeCompare(b.itemId),
        )) {
          try {
            await parent(tx, { ...input, itemId: request.itemId }, false);
          } catch (error) {
            if (error instanceof ContactsError && error.status === 404) {
              continue;
            }
            throw error;
          }
          const row = (await attachment(tx, { ...input, ...request }))[0];
          if (
            row?.attachment.published &&
            row.asset.confirmedAt &&
            row.asset.deletedAt === null
          ) {
            rows.push({ request, identity: identity(row) });
          }
        }
        return rows;
      });
      return {
        kind: "success" as const,
        reads: await Promise.all(
          readable.map(async ({ request, identity }) => ({
            ...request,
            url: await signRead({ identity, variant: request.variant }),
            expiresInSeconds: mediaReadLifetimeSeconds,
          })),
        ),
      };
    },
  };
}

export type ContactMediaServices = ReturnType<
  typeof createContactMediaServices
>;
