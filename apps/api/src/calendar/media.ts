import { randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import { calendarItems, calendarMedia, media } from "@home-hub/database/schema";
import {
  type StillImageContentType,
  stillImageUploadSchema,
} from "@home-hub/shared/media";
import {
  type MediaIdentity,
  type MediaProcessingCapability,
  type MediaReadCapability,
  mediaOriginalObjectKey,
  mediaReadLifetimeSeconds,
  mediaStorageIdentity,
} from "@home-hub/shared/media-delivery";
import { appendSortKey } from "@home-hub/shared/ordering";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";
import type { InspectR2ObjectResult } from "../media/inspect-object";
import { InvalidMediaUploadError } from "../media/process-image";
import { mediaUploadUrlLifetimeSeconds } from "../media/sign-upload";

type Scope = { userId: string; householdId: string; itemId: string };

type AttachmentScope = Scope & { attachmentId: string };

type Failure = { kind: "unauthorized" | "forbidden" | "not_found" };

export type CalendarMediaDependencies = {
  db: Database;
  signUpload: (input: {
    objectKey: string;
    contentType: StillImageContentType;
  }) => Promise<string>;
  inspectObject: (input: {
    objectKey: string;
  }) => Promise<InspectR2ObjectResult | null>;
  processImage: (input: {
    identity: MediaIdentity;
    contentType: MediaProcessingCapability["contentType"];
    byteSize: number;
  }) => Promise<void>;
  signRead: (input: {
    identity: MediaIdentity;
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
      moduleKey: "calendar",
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

  const [item] = await tx
    .select({ id: calendarItems.id })
    .from(calendarItems)
    .where(
      and(
        eq(calendarItems.id, input.itemId),
        eq(calendarItems.householdId, input.householdId),
        isNull(calendarItems.deletedAt),
      ),
    )
    .limit(1)
    .for(lock);

  return item ? access : { kind: "not_found" };
}

const join = and(
  eq(media.id, calendarMedia.mediaId),
  eq(media.householdId, calendarMedia.householdId),
);

const details = {
  id: calendarMedia.id,
  mediaId: media.id,
  itemId: calendarMedia.itemId,
  householdId: calendarMedia.householdId,
  objectKey: media.objectKey,
  contentType: media.contentType,
  byteSize: media.byteSize,
  confirmedAt: media.confirmedAt,
};

type Attachment = {
  id: string;
  mediaId: string;
  itemId: string;
  householdId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  confirmedAt: Date | null;
};

function identity(row: Attachment): MediaIdentity {
  return {
    ...mediaStorageIdentity(row),
    moduleKey: "calendar",
    parentId: row.itemId,
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
    .from(calendarMedia)
    .innerJoin(media, join)
    .where(
      and(
        eq(calendarMedia.id, input.attachmentId),
        eq(calendarMedia.itemId, input.itemId),
        eq(calendarMedia.householdId, input.householdId),
        isNull(calendarMedia.deletedAt),
        isNull(media.deletedAt),
        eq(media.kind, "image"),
      ),
    )
    .limit(1)
    .for(lock);

  return row;
}

export async function removeCalendarAttachment(
  tx: DatabaseTransaction,
  input: AttachmentScope,
) {
  const access = await authorize(tx, input);

  if (access.kind !== "authorized") {
    return access;
  }

  const row = await findAttachment(tx, input, "update");

  if (!row) {
    return { kind: "success" as const };
  }

  const deletedAt = new Date();
  await tx
    .update(calendarMedia)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(
      and(
        eq(calendarMedia.id, row.id),
        eq(calendarMedia.householdId, input.householdId),
      ),
    );

  return { kind: "success" as const };
}

export function createCalendarMediaServices(
  dependencies: CalendarMediaDependencies,
) {
  const { db, signUpload, inspectObject, processImage, signRead } =
    dependencies;

  return {
    async createUpload(
      input: Scope & {
        contentType: StillImageContentType;
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
        // Serializes sparse-order assignment and archive/rename changes for this calendar item.
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
          .select({ sortKey: calendarMedia.sortKey })
          .from(calendarMedia)
          .where(
            and(
              eq(calendarMedia.householdId, input.householdId),
              eq(calendarMedia.itemId, input.itemId),
              isNull(calendarMedia.deletedAt),
            ),
          )
          .orderBy(asc(calendarMedia.sortKey), calendarMedia.id)
          .limit(1);
        await tx.insert(media).values({
          id: mediaId,
          householdId: input.householdId,
          kind: "image",
          objectKey,
          ...metadata,
        });
        await tx.insert(calendarMedia).values({
          id: attachmentId,
          householdId: input.householdId,
          itemId: input.itemId,
          mediaId,
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

      try {
        await processImage({
          identity: identity(row),
          contentType: stillImageUploadSchema.shape.contentType.parse(
            row.contentType,
          ),
          byteSize: row.byteSize,
        });
      } catch (error) {
        if (error instanceof InvalidMediaUploadError) {
          return { kind: "invalid_upload" as const };
        }

        throw error;
      }

      return db.transaction(async (tx) => {
        const access = await authorize(tx, input);

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
          throw new Error("Calendar media changed during confirmation");
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
          .set({ confirmedAt, animated: false, updatedAt: confirmedAt })
          .where(
            and(
              eq(media.id, current.mediaId),
              eq(media.householdId, input.householdId),
            ),
          );

        return {
          kind: "success" as const,
          attachment: { id: current.id, confirmedAt },
        };
      });
    },

    async deleteAttachment(input: AttachmentScope) {
      return db.transaction((tx) => removeCalendarAttachment(tx, input));
    },

    async readUrls(
      input: Pick<Scope, "userId" | "householdId"> & {
        requests: {
          itemId: string;
          attachmentId: string;
          variant: MediaReadCapability["variant"];
        }[];
      },
    ) {
      const unique = [
        ...new Map(
          input.requests.map((r) => [
            JSON.stringify([r.itemId, r.attachmentId, r.variant]),
            r,
          ]),
        ).values(),
      ];

      if (!unique.length || unique.length > 100) {
        throw new Error("Invalid calendar media batch");
      }

      const authorized = await db.transaction(async (tx) => {
        const access = await authorizeHousehold(tx, input);

        if (access.kind !== "authorized") {
          return access;
        }

        // Reorders/uploads lock the calendar parent before attachment rows.
        // Acquire these shared locks in the same order to avoid deadlocks.
        const parents = await tx
          .select({ id: calendarItems.id })
          .from(calendarItems)
          .where(
            and(
              eq(calendarItems.householdId, input.householdId),
              isNull(calendarItems.deletedAt),
              inArray(
                calendarItems.id,
                unique.map((request) => request.itemId),
              ),
            ),
          )
          .orderBy(calendarItems.id)
          .for("share");

        if (!parents.length) {
          return {
            kind: "attachments" as const,
            rows: new Map<string, Attachment>(),
          };
        }

        const rows = await tx
          .select(details)
          .from(calendarMedia)
          .innerJoin(media, join)

          .where(
            and(
              eq(calendarMedia.householdId, input.householdId),
              inArray(
                calendarMedia.id,
                unique.map((r) => r.attachmentId),
              ),
              inArray(
                calendarMedia.itemId,
                parents.map((parent) => parent.id),
              ),
              isNull(calendarMedia.deletedAt),
              isNull(media.deletedAt),
              eq(media.kind, "image"),
              isNotNull(media.confirmedAt),
            ),
          )
          .for("share");

        return {
          kind: "attachments" as const,
          rows: new Map(rows.map((r) => [JSON.stringify([r.itemId, r.id]), r])),
        };
      });

      if (authorized.kind !== "attachments") {
        return authorized;
      }

      const readable = unique.flatMap((request) => {
        const row = authorized.rows.get(
          JSON.stringify([request.itemId, request.attachmentId]),
        );

        return row ? [{ request, row }] : [];
      });

      return {
        kind: "success" as const,
        reads: await Promise.all(
          readable.map(async ({ request, row }) => ({
            ...request,
            url: await signRead({
              identity: identity(row),
              variant: request.variant,
            }),
            expiresInSeconds: mediaReadLifetimeSeconds,
          })),
        ),
      };
    },
  };
}

export type CalendarMediaServices = ReturnType<
  typeof createCalendarMediaServices
>;
