import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import {
  findRecipeImageObjectForShare,
  findRecipeImageObjectForUpdate,
} from "./scoped-entities";

type DeleteObject = (input: { objectKey: string }) => Promise<void>;

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

export function createDeleteRecipeImageService({
  db,
  deleteObject,
}: {
  db: Database;
  deleteObject: DeleteObject;
}) {
  return async function deleteRecipeImage({
    userId,
    householdId,
    recipeId,
    imageId,
  }: DeleteRecipeImageInput): Promise<DeleteRecipeImageResult> {
    const initial = await db.transaction(async (tx) => {
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

      const image = await findRecipeImageObjectForShare(tx, {
        householdId,
        recipeId,
        imageId,
      });

      return image
        ? { kind: "image" as const, objectKey: image.objectKey }
        : { kind: "success" as const };
    });

    if (initial.kind !== "image") return initial;

    await deleteObject({ objectKey: initial.objectKey });

    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);
      if (!user) return { kind: "unauthorized" };

      const membership = await findHouseholdMembershipForShare(tx, {
        householdId,
        userId,
      });
      if (!membership) return { kind: "forbidden" };

      const moduleSetting = await findEnabledHouseholdModuleForShare(tx, {
        householdId,
        moduleKey: "recipes",
      });
      if (!moduleSetting) return { kind: "forbidden" };

      const image = await findRecipeImageObjectForUpdate(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "success" };

      if (image.objectKey !== initial.objectKey) {
        throw new Error("Recipe image changed during deletion");
      }

      const [deletedImage] = await tx
        .delete(recipeImages)
        .where(
          and(
            eq(recipeImages.id, imageId),
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
            eq(recipeImages.objectKey, initial.objectKey),
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
