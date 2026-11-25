import type { Database, DatabaseTransaction } from "@home-hub/database";
import { attachmentRemovalSchema } from "@home-hub/shared/zero/attachment-mutators";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import type { Schema } from "@home-hub/shared/zero/schema";
import { ApplicationError, defineMutatorWithType } from "@rocicorp/zero";
import { removeCalendarAttachment } from "../calendar/media";
import { removeContactAttachment } from "../contacts/media";
import { ContactsError } from "../contacts/records";
import { removeListAttachment } from "../lists/media";
import { createDeleteRecipeImageService } from "../recipes/images/delete";
import { removeExerciseAttachment } from "../workouts/exercise-media";

const define = defineMutatorWithType<
  Schema,
  ZeroAuthContext,
  DatabaseTransaction
>();

export const attachmentServerMutators = {
  remove: define(attachmentRemovalSchema, async ({ tx, ctx, args }) => {
    if (tx.location !== "server") {
      throw Error("Server transaction required");
    }

    const db = tx.dbTransaction.wrappedTransaction;
    const input = {
      userId: ctx.userId,
      householdId: args.householdId,
      attachmentId: args.attachmentId,
    };

    try {
      let result: { kind: string };
      switch (args.kind) {
        case "recipe": {
          const connection: Pick<Database, "transaction"> = {
            transaction: (work) => work(db),
          };
          result = await createDeleteRecipeImageService({ db: connection })({
            ...input,
            recipeId: args.parentId,
            imageId: args.attachmentId,
          });
          break;
        }
        case "calendar":
          result = await removeCalendarAttachment(db, {
            ...input,
            itemId: args.parentId,
          });
          break;
        case "moodboard":
          result = await removeListAttachment(db, {
            ...input,
            listId: args.parentId,
          });
          break;
        case "exercise":
          result = await removeExerciseAttachment(db, {
            ...input,
            exerciseId: args.parentId,
          });
          break;
        case "contact-profile":
        case "contact-entry":
          result = await removeContactAttachment(
            db,
            { ...input, itemId: args.parentId },
            args.kind === "contact-profile" ? "profile" : "entry",
          );
          break;
      }

      if (result.kind !== "success") {
        throw new ApplicationError("Attachment unavailable", {
          details: { kind: result.kind },
        });
      }

      return { kind: "success" };
    } catch (error) {
      if (error instanceof ContactsError) {
        const kind =
          error.status === 401
            ? "unauthorized"
            : error.status === 403
              ? "forbidden"
              : error.status === 404
                ? "not_found"
                : "invalid_action";
        throw new ApplicationError(error.message, { details: { kind } });
      }

      throw error;
    }
  }),
};
