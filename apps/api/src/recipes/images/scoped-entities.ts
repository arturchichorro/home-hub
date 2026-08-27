import type { DatabaseTransaction } from "@home-hub/database";
import {
  recipeCookLogs,
  recipeImages,
  recipes,
} from "@home-hub/database/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

type RecipeEntityInput = { householdId: string; recipeId: string };
type RecipeImageInput = RecipeEntityInput & { imageId: string };

export async function findRecipeForShare(
  tx: DatabaseTransaction,
  { householdId, recipeId }: RecipeEntityInput,
) {
  const [recipe] = await tx
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.householdId, householdId), eq(recipes.id, recipeId)))
    .limit(1)
    .for("share");

  return recipe;
}

export async function findRecipeCookLogForShare(
  tx: DatabaseTransaction,
  {
    householdId,
    recipeId,
    cookLogId,
  }: RecipeEntityInput & { cookLogId: string },
) {
  const [cookLog] = await tx
    .select({ id: recipeCookLogs.id })
    .from(recipeCookLogs)
    .where(
      and(
        eq(recipeCookLogs.householdId, householdId),
        eq(recipeCookLogs.recipeId, recipeId),
        eq(recipeCookLogs.id, cookLogId),
      ),
    )
    .limit(1)
    .for("share");

  return cookLog;
}

export async function findConfirmedRecipeImageForShare(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
  const [image] = await tx
    .select({ objectKey: recipeImages.objectKey })
    .from(recipeImages)
    .where(
      and(
        eq(recipeImages.id, imageId),
        eq(recipeImages.householdId, householdId),
        eq(recipeImages.recipeId, recipeId),
        isNotNull(recipeImages.confirmedAt),
      ),
    )
    .limit(1)
    .for("share");

  return image;
}

export async function findConfirmedHouseholdRecipeImagesForShare(
  tx: DatabaseTransaction,
  { householdId, imageIds }: { householdId: string; imageIds: string[] },
) {
  return tx
    .select({ id: recipeImages.id, recipeId: recipeImages.recipeId })
    .from(recipeImages)
    .where(
      and(
        inArray(recipeImages.id, imageIds),
        eq(recipeImages.householdId, householdId),
        isNotNull(recipeImages.confirmedAt),
      ),
    )
    .for("share");
}

const recipeImageDetails = {
  id: recipeImages.id,
  objectKey: recipeImages.objectKey,
  contentType: recipeImages.contentType,
  byteSize: recipeImages.byteSize,
  confirmedAt: recipeImages.confirmedAt,
};

export async function findRecipeImageForShare(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
  const [image] = await tx
    .select(recipeImageDetails)
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

  return image;
}

export async function findRecipeImageForUpdate(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
  const [image] = await tx
    .select(recipeImageDetails)
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

  return image;
}

export async function findRecipeImageObjectForShare(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
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

  return image;
}

export async function findRecipeImageObjectForUpdate(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
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

  return image;
}
