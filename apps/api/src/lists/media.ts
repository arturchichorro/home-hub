import { randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import { listMedia, lists, media } from "@home-hub/database/schema";
import { createListMediaUploadSchema } from "@home-hub/shared/list-media";
import {
  type MediaContentType,
  stillImageUploadSchema,
  type VideoContentType,
} from "@home-hub/shared/media";
import {
  type MediaIdentity,
  type MediaProcessingCapability,
  type MediaReadCapability,
  mediaOriginalObjectKey,
  mediaReadLifetimeSeconds,
  mediaStorageIdentity,
} from "@home-hub/shared/media-delivery";
import { nextSortKey } from "@home-hub/shared/ordering";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";
import type { InspectR2ObjectResult } from "../media/inspect-object";
import { InvalidMediaUploadError } from "../media/process-image";
import { VideoProcessingBusyError } from "../media/process-video";
import { mediaUploadUrlLifetimeSeconds } from "../media/sign-upload";

type Scope = { userId: string; householdId: string; listId: string };

type AttachmentScope = Scope & { attachmentId: string };

type Failure = { kind: "unauthorized" | "forbidden" | "not_found" };

export type ListMediaDependencies = {
  db: Database;
  signUpload: (input: {
    objectKey: string;
    contentType: MediaContentType;
  }) => Promise<string>;
  inspectObject: (input: {
    objectKey: string;
  }) => Promise<InspectR2ObjectResult | null>;
  processImage: (input: {
    identity: MediaIdentity;
    contentType: MediaProcessingCapability["contentType"];
    byteSize: number;
  }) => Promise<void>;
  processVideo: (input: {
    identity: MediaIdentity;
    contentType: VideoContentType;
    byteSize: number;
  }) => Promise<{
    width: number;
    height: number;
    durationMs: number;
    videoVersion: string;
  }>;
  signVideo: (input: {
    identity: MediaIdentity;
    contentType: VideoContentType;
    videoVersion: string;
  }) => Promise<string>;
  signRead: (input: {
    identity: MediaIdentity & { videoVersion?: string };
    variant: MediaReadCapability["variant"];
  }) => Promise<string>;
};

async function authorizeHousehold(
  tx: DatabaseTransaction,
  input: Pick<Scope, "userId" | "householdId">,
): Promise<Failure | { kind: "authorized" }> {
  if (!(await findActiveUser(tx, input.userId))) {
    return { kind: "unauthorized" };
  }

  if (!(await findHouseholdMembershipForShare(tx, input))) {
    return { kind: "forbidden" };
  }

  if (
    !(await findEnabledHouseholdModuleForShare(tx, {
      householdId: input.householdId,
      moduleKey: "lists",
    }))
  ) {
    return { kind: "forbidden" };
  }

  return { kind: "authorized" };
}

async function authorize(
  tx: DatabaseTransaction,
  input: Scope,
  lock: "share" | "update" = "share",
): Promise<Failure | { kind: "authorized" }> {
  const access = await authorizeHousehold(tx, input);

  if (access.kind !== "authorized") {
    return access;
  }

  const [exercise] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.id, input.listId),
        eq(lists.householdId, input.householdId),
        isNull(lists.deletedAt),
        eq(lists.kind, "moodboard"),
      ),
    )
    .limit(1)
    .for(lock);

  return exercise ? access : { kind: "not_found" };
}

const join = and(
  eq(media.id, listMedia.mediaId),
  eq(media.householdId, listMedia.householdId),
);

const details = {
  id: listMedia.id,
  mediaId: media.id,
  listId: listMedia.listId,
  householdId: listMedia.householdId,
  objectKey: media.objectKey,
  contentType: media.contentType,
  byteSize: media.byteSize,
  confirmedAt: media.confirmedAt,
  kind: media.kind,
  videoVersion: media.videoVersion,
};

type Attachment = {
  id: string;
  mediaId: string;
  listId: string;
  householdId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  confirmedAt: Date | null;
  kind: string;
  videoVersion: string | null;
};

function identity(row: Attachment): MediaIdentity {
  return {
    ...mediaStorageIdentity(row),
    moduleKey: "lists",
    parentId: row.listId,
    attachmentId: row.id,
  };
}

async function findAttachment(
  tx: DatabaseTransaction,
  input: AttachmentScope,
  lock: "share" | "update",
) {
  const [row] = await tx
    .select(details)
    .from(listMedia)
    .innerJoin(media, join)
    .where(
      and(
        eq(listMedia.id, input.attachmentId),
        eq(listMedia.listId, input.listId),
        eq(listMedia.householdId, input.householdId),
        isNull(listMedia.deletedAt),
        isNull(media.deletedAt),
      ),
    )
    .limit(1)
    .for(lock);

  return row;
}

async function refreshCount(tx: DatabaseTransaction, input: Scope) {
  await tx.execute(
    sql`UPDATE lists SET media_count=(SELECT count(*) FROM list_media a JOIN media m ON m.id=a.media_id AND m.household_id=a.household_id WHERE a.list_id=${input.listId}::uuid AND a.household_id=${input.householdId}::uuid AND a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.confirmed_at IS NOT NULL) WHERE id=${input.listId}::uuid AND household_id=${input.householdId}::uuid`,
  );
}

export function createListMediaServices(dependencies: ListMediaDependencies) {
  const {
    db,
    signUpload,
    inspectObject,
    processImage,
    signRead,
    processVideo,
    signVideo,
  } = dependencies;

  return {
    async createUpload(
      input: Scope & {
        contentType: MediaContentType;
        byteSize: number;
        width: number;
        height: number;
      },
    ) {
      const metadata = createListMediaUploadSchema.parse({
        contentType: input.contentType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
      });

      return db.transaction(async (tx) => {
        // Serializes sparse-order assignment and archive/rename changes for this catalog entry.
        const access = await authorize(tx, input, "update");

        if (access.kind !== "authorized") {
          return access;
        }

        const mediaId = randomUUID();
        const attachmentId = randomUUID();
        const objectKey = mediaOriginalObjectKey({
          householdId: input.householdId,
          mediaId,
          storageRecipeId: null,
        });
        const [bottom] = await tx
          .select({ sortKey: listMedia.sortKey })
          .from(listMedia)
          .where(
            and(
              eq(listMedia.householdId, input.householdId),
              eq(listMedia.listId, input.listId),
              isNull(listMedia.deletedAt),
            ),
          )
          .orderBy(desc(listMedia.sortKey), listMedia.id)
          .limit(1);
        await tx.insert(media).values({
          id: mediaId,
          householdId: input.householdId,
          kind: metadata.contentType.startsWith("video/") ? "video" : "image",
          objectKey,
          ...metadata,
        });
        await tx.insert(listMedia).values({
          id: attachmentId,
          householdId: input.householdId,
          listId: input.listId,
          mediaId,
          sortKey: nextSortKey(bottom?.sortKey),
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
        const access = await authorize(tx, input);

        if (access.kind !== "authorized") {
          return access;
        }

        const row = await findAttachment(tx, input, "share");

        return row
          ? { kind: "attachment" as const, row }
          : { kind: "not_found" as const };
      });

      if (initial.kind !== "attachment") {
        return initial;
      }

      const row = initial.row;

      if (row.confirmedAt) {
        return {
          kind: "success" as const,
          attachment: { id: row.id, confirmedAt: row.confirmedAt },
        };
      }

      const object = await inspectObject({ objectKey: row.objectKey });

      if (!object) {
        return { kind: "upload_not_found" as const };
      }

      if (
        object.contentType !== row.contentType ||
        object.byteSize !== row.byteSize
      ) {
        return { kind: "invalid_upload" as const };
      }

      let processed:
        | {
            width: number;
            height: number;
            durationMs: number;
            videoVersion: string;
          }
        | undefined;

      try {
        if (row.kind === "video") {
          processed = await processVideo({
            identity: identity(row),
            contentType: row.contentType as VideoContentType,
            byteSize: row.byteSize,
          });
        } else {
          await processImage({
            identity: identity(row),
            contentType: stillImageUploadSchema.shape.contentType.parse(
              row.contentType,
            ),
            byteSize: row.byteSize,
          });
        }
      } catch (error) {
        if (error instanceof VideoProcessingBusyError) {
          return { kind: "busy" as const };
        }

        if (error instanceof InvalidMediaUploadError) {
          return { kind: "invalid_upload" as const };
        }

        throw error;
      }

      return db.transaction(async (tx) => {
        const access = await authorize(tx, input, "update");

        if (access.kind !== "authorized") {
          return access;
        }

        const current = await findAttachment(tx, input, "update");

        if (!current) {
          return { kind: "not_found" as const };
        }

        if (
          current.mediaId !== row.mediaId ||
          current.objectKey !== row.objectKey ||
          current.contentType !== row.contentType ||
          current.byteSize !== row.byteSize
        ) {
          throw new Error("Exercise media changed during confirmation");
        }

        if (current.confirmedAt) {
          return {
            kind: "success" as const,
            attachment: { id: current.id, confirmedAt: current.confirmedAt },
          };
        }

        const confirmedAt = new Date();
        await tx
          .update(media)
          .set({
            confirmedAt,
            animated: row.kind === "image" ? false : null,
            updatedAt: confirmedAt,
            ...processed,
          })
          .where(
            and(
              eq(media.id, current.mediaId),
              eq(media.householdId, input.householdId),
            ),
          );
        await refreshCount(tx, input);

        return {
          kind: "success" as const,
          attachment: { id: current.id, confirmedAt },
        };
      });
    },

    async deleteAttachment(input: AttachmentScope) {
      return db.transaction(async (tx) => {
        const access = await authorize(tx, input, "update");

        if (access.kind !== "authorized") {
          return access;
        }

        const row = await findAttachment(tx, input, "update");

        if (!row) {
          return { kind: "success" as const };
        }

        const deletedAt = new Date();
        await tx
          .update(listMedia)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(
            and(
              eq(listMedia.id, row.id),
              eq(listMedia.householdId, input.householdId),
            ),
          );
        await refreshCount(tx, input);

        return { kind: "success" as const };
      });
    },

    async readUrls(
      input: Pick<Scope, "userId" | "householdId"> & {
        requests: {
          listId: string;
          attachmentId: string;
          variant: MediaReadCapability["variant"] | "video";
        }[];
      },
    ) {
      const unique = [
        ...new Map(
          input.requests.map((r) => [
            JSON.stringify([r.listId, r.attachmentId, r.variant]),
            r,
          ]),
        ).values(),
      ];

      if (!unique.length || unique.length > 100) {
        throw new Error("Invalid exercise media batch");
      }

      const authorized = await db.transaction(async (tx) => {
        const access = await authorizeHousehold(tx, input);

        if (access.kind !== "authorized") {
          return access;
        }

        // Reorders/uploads lock the catalog parent before attachment rows.
        // Acquire these shared locks in the same order to avoid deadlocks.
        const parents = await tx
          .select({ id: lists.id })
          .from(lists)
          .where(
            and(
              eq(lists.householdId, input.householdId),
              isNull(lists.deletedAt),
              inArray(
                lists.id,
                unique.map((request) => request.listId),
              ),
            ),
          )
          .orderBy(lists.id)
          .for("share");

        if (!parents.length) {
          return {
            kind: "attachments" as const,
            rows: new Map<string, Attachment>(),
          };
        }

        const rows = await tx
          .select(details)
          .from(listMedia)
          .innerJoin(media, join)

          .where(
            and(
              eq(listMedia.householdId, input.householdId),
              inArray(
                listMedia.id,
                unique.map((r) => r.attachmentId),
              ),
              inArray(
                listMedia.listId,
                parents.map((parent) => parent.id),
              ),
              isNull(listMedia.deletedAt),
              isNull(media.deletedAt),
              isNotNull(media.confirmedAt),
            ),
          )
          .for("share");

        return {
          kind: "attachments" as const,
          rows: new Map(rows.map((r) => [JSON.stringify([r.listId, r.id]), r])),
        };
      });

      if (authorized.kind !== "attachments") {
        return authorized;
      }

      const readable = unique.flatMap((request) => {
        const row = authorized.rows.get(
          JSON.stringify([request.listId, request.attachmentId]),
        );

        return row &&
          (request.variant !== "video" ||
            (row.kind === "video" && row.videoVersion))
          ? [{ request, row }]
          : [];
      });

      return {
        kind: "success" as const,
        reads: await Promise.all(
          readable.map(async ({ request, row }) => ({
            ...request,
            url:
              request.variant === "video"
                ? await signVideo({
                    identity: identity(row),
                    contentType: row.contentType as VideoContentType,
                    videoVersion: row.videoVersion as string,
                  })
                : await signRead({
                    identity: {
                      ...identity(row),
                      ...(row.videoVersion
                        ? { videoVersion: row.videoVersion }
                        : {}),
                    },
                    variant: request.variant,
                  }),
            expiresInSeconds: mediaReadLifetimeSeconds,
          })),
        ),
      };
    },
  };
}

export type ListMediaServices = ReturnType<typeof createListMediaServices>;
