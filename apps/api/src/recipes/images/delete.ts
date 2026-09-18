import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import type { RequestAccess } from "@home-hub/shared/access";
import { and, eq } from "drizzle-orm";
import { authorizeHouseholdModule } from "../../authorization/module-access";
import { findRecipeImageObjectForUpdate } from "./scoped-entities";

export type DeleteRecipeImageInput = {
  requestAccess: RequestAccess;
  householdId: string;
  recipeId: string;
  imageId: string;
};

export type DeleteRecipeImageResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success" };

export function createDeleteRecipeImageService({ db }: { db: Database }) {
  return async function deleteRecipeImage(
    input: DeleteRecipeImageInput,
  ): Promise<DeleteRecipeImageResult> {
    const { householdId, recipeId, imageId } = input;
    return db.transaction(async (tx) => {
      const failure = await authorizeHouseholdModule(tx, {
        requestAccess: input.requestAccess,
        householdId,
        moduleKey: "recipes",
        write: true,
      });
      if (failure) return { kind: failure };

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
