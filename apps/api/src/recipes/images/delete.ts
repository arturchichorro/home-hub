import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { and, eq } from "drizzle-orm";
import { authorizeModule } from "../../authorization/module-access";
import { findRecipeImageObjectForUpdate } from "./scoped-entities";

export type DeleteRecipeImageInput = {
  principal: ZeroAuthContext;
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
    principal,
    householdId,
    recipeId,
    imageId,
  }: DeleteRecipeImageInput): Promise<DeleteRecipeImageResult> {
    return db.transaction(async (tx) => {
      const denied = await authorizeModule(tx, {
        principal,
        householdId,
        moduleKey: "recipes",
        write: true,
      });
      if (denied) return { kind: denied };

      const image = await findRecipeImageObjectForUpdate(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "success" };

      const deletedAt = new Date();
      const [deletedImage] = await tx
        .update(recipeImages)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            eq(recipeImages.id, imageId),
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
            eq(recipeImages.objectKey, image.objectKey),
          ),
        )
        .returning({ id: recipeImages.id });
      if (!deletedImage) {
        throw new Error("Recipe image deletion returned no row");
      }

      return { kind: "success" };
    });
  };
}
