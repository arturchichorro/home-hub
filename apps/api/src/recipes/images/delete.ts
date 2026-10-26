import type { Database } from "@home-hub/database";
import { recipeMedia } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import { findRecipeImageObjectForUpdate } from "./scoped-entities";

export type DeleteRecipeImageInput = {
  userId: string;
  householdId: string;
  recipeId: string;
  imageId: string;
};

export type DeleteRecipeImageResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success" };

export function createDeleteRecipeImageService({ db }: { db: Database }) {
  return async function deleteRecipeImage({
    userId,
    householdId,
    recipeId,
    imageId,
  }: DeleteRecipeImageInput): Promise<DeleteRecipeImageResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);
      if (!user) return { kind: "unauthorized" as const };

      const membership = await findHouseholdMembershipForShare(tx, {
        householdId,
        userId,
      });
      if (!membership) return { kind: "forbidden" as const };

      const moduleSetting = await findEnabledHouseholdModuleForShare(tx, {
        householdId,
        moduleKey: "recipes",
      });
      if (!moduleSetting) return { kind: "forbidden" as const };

      const image = await findRecipeImageObjectForUpdate(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "success" };

      const deletedAt = new Date();
      const [deletedImage] = await tx
        .update(recipeMedia)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            eq(recipeMedia.id, imageId),
            eq(recipeMedia.householdId, householdId),
            eq(recipeMedia.recipeId, recipeId),
            eq(recipeMedia.mediaId, image.mediaId),
          ),
        )
        .returning({ id: recipeMedia.id });
      if (!deletedImage) {
        throw new Error("Recipe image deletion returned no row");
      }

      return { kind: "success" };
    });
  };
}
