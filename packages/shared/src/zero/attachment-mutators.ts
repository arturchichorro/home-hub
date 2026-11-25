import { defineMutatorWithType } from "@rocicorp/zero";
import * as z from "zod";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

export const attachmentRemovalSchema = z
  .object({
    kind: z.enum([
      "recipe",
      "calendar",
      "moodboard",
      "exercise",
      "contact-profile",
      "contact-entry",
    ]),
    householdId: z.uuid(),
    parentId: z.uuid(),
    attachmentId: z.uuid(),
    optimisticTimestamp: z.number().finite().nonnegative(),
  })
  .strict();

export type AttachmentRemovalInput = Omit<
  z.infer<typeof attachmentRemovalSchema>,
  "optimisticTimestamp"
>;

export const attachmentRemovalResultSchema = z.object({
  kind: z.enum([
    "success",
    "unauthorized",
    "forbidden",
    "not_found",
    "invalid_action",
  ]),
});

const define = defineMutatorWithType<Schema, ZeroAuthContext>();

export const attachmentMutators = {
  remove: define(attachmentRemovalSchema, async ({ tx, args }) => {
    if (tx.location !== "client") {
      throw Error("Attachment removal requires its server implementation");
    }

    const change = {
      id: args.attachmentId,
      deletedAt: args.optimisticTimestamp,
      updatedAt: args.optimisticTimestamp,
    };

    switch (args.kind) {
      case "recipe": {
        const row = await tx.run(
          zql.recipeMedia
            .where("id", args.attachmentId)
            .where("householdId", args.householdId)
            .where("recipeId", args.parentId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (row) {
          await tx.mutate.recipeMedia.update(change);
        }
        break;
      }
      case "calendar": {
        const row = await tx.run(
          zql.calendarMedia
            .where("id", args.attachmentId)
            .where("householdId", args.householdId)
            .where("itemId", args.parentId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (row) {
          await tx.mutate.calendarMedia.update(change);
        }
        break;
      }
      case "moodboard": {
        const row = await tx.run(
          zql.listMedia
            .where("id", args.attachmentId)
            .where("householdId", args.householdId)
            .where("listId", args.parentId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (row) {
          await tx.mutate.listMedia.update(change);
        }
        break;
      }
      case "exercise": {
        const row = await tx.run(
          zql.exerciseMedia
            .where("id", args.attachmentId)
            .where("householdId", args.householdId)
            .where("exerciseId", args.parentId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (row) {
          await tx.mutate.exerciseMedia.update(change);
        }
        break;
      }
      case "contact-profile":
      case "contact-entry": {
        const row = await tx.run(
          zql.contactMedia
            .where("id", args.attachmentId)
            .where("householdId", args.householdId)
            .where("parentId", args.parentId)
            .where(
              args.kind === "contact-profile" ? "contactId" : "entryId",
              args.parentId,
            )
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (!row) {
          break;
        }

        if (args.kind === "contact-entry" && row.published) {
          const entry = await tx.run(
            zql.contactEntries
              .where("id", args.parentId)
              .where("householdId", args.householdId)
              .one(),
          );
          const others = await tx.run(
            zql.contactMedia
              .where("entryId", args.parentId)
              .where("id", "!=", row.id)
              .where("published", true)
              .where("deletedAt", "IS", null)
              .limit(1),
          );
          if (!(entry?.note ?? "").trim() && !others.length) {
            // Never optimistically empty a shared published entry. The server
            // decides against its locked canonical text and confirmed pictures.
            break;
          }
        }

        await tx.mutate.contactMedia.update({ ...change, published: false });
        break;
      }
    }
  }),
};
