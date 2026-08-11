import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
} from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

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
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });
      if (!user) return { kind: "unauthorized" as const };

      const [membership] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("share");
      if (!membership) return { kind: "forbidden" as const };

      const [moduleSetting] = await tx
        .select({ householdId: householdModuleSettings.householdId })
        .from(householdModuleSettings)
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, "recipes"),
            eq(householdModuleSettings.enabled, true),
          ),
        )
        .limit(1)
        .for("share");
      if (!moduleSetting) return { kind: "forbidden" as const };

      const [image] = await tx
        .select({ objectKey: recipeImages.objectKey })
        .from(recipeImages)
        .where(
          and(
            eq(recipeImages.id, imageId),
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
          ),
        )
        .limit(1)
        .for("share");

      return image
        ? { kind: "image" as const, objectKey: image.objectKey }
        : { kind: "success" as const };
    });

    if (initial.kind !== "image") return initial;

    await deleteObject({ objectKey: initial.objectKey });

    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });
      if (!user) return { kind: "unauthorized" };

      const [membership] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("share");
      if (!membership) return { kind: "forbidden" };

      const [moduleSetting] = await tx
        .select({ householdId: householdModuleSettings.householdId })
        .from(householdModuleSettings)
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, "recipes"),
            eq(householdModuleSettings.enabled, true),
          ),
        )
        .limit(1)
        .for("share");
      if (!moduleSetting) return { kind: "forbidden" };

      const [image] = await tx
        .select({ objectKey: recipeImages.objectKey })
        .from(recipeImages)
        .where(
          and(
            eq(recipeImages.id, imageId),
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
          ),
        )
        .limit(1)
        .for("update");
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
