import type { DatabaseTransaction } from "@home-hub/database";
import {
  media,
  recipeCookLogs,
  recipeMedia,
  recipes,
} from "@home-hub/database/schema";
import { and, eq, exists, inArray, isNotNull, isNull } from "drizzle-orm";

type RecipeEntityInput = { householdId: string; recipeId: string };
type RecipeImageInput = RecipeEntityInput & { imageId: string };

const activeRecipeExists = (
  tx: DatabaseTransaction,
  { householdId, recipeId }: RecipeEntityInput,
) =>
  exists(
    tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          eq(recipes.householdId, householdId),
          eq(recipes.id, recipeId),
          isNull(recipes.deletedAt),
        ),
      ),
  );

export async function findRecipeForShare(
  tx: DatabaseTransaction,
  { householdId, recipeId }: RecipeEntityInput,
) {
  const [recipe] = await tx
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        eq(recipes.id, recipeId),
        isNull(recipes.deletedAt),
      ),
    )
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
        isNull(recipeCookLogs.deletedAt),
      ),
    )
    .limit(1)
    .for("share");

  return cookLog;
}

const details = {
  id: recipeMedia.id,
  mediaId: media.id,
  objectKey: media.objectKey,
  contentType: media.contentType,
  byteSize: media.byteSize,
  confirmedAt: media.confirmedAt,
};

const assetJoin = and(
  eq(media.id, recipeMedia.mediaId),
  eq(media.householdId, recipeMedia.householdId),
);

function scopedImageQuery(
  tx: DatabaseTransaction,
  { householdId, recipeId, imageId }: RecipeImageInput,
) {
  return tx
    .select(details)
    .from(recipeMedia)
    .innerJoin(media, assetJoin)
    .where(
      and(
        eq(recipeMedia.id, imageId),
        eq(recipeMedia.householdId, householdId),
        eq(recipeMedia.recipeId, recipeId),
        isNull(recipeMedia.deletedAt),
        isNull(media.deletedAt),
        eq(media.kind, "image"),
        activeRecipeExists(tx, { householdId, recipeId }),
      ),
    )
    .limit(1);
}

export async function findConfirmedRecipeImageForShare(
  tx: DatabaseTransaction,
  input: RecipeImageInput,
) {
  const [image] = await scopedImageQuery(tx, input).for("share");
  return image?.confirmedAt ? image : undefined;
}

export async function findConfirmedHouseholdRecipeImagesForShare(
  tx: DatabaseTransaction,
  { householdId, imageIds }: { householdId: string; imageIds: string[] },
) {
  return tx
    .select({ ...details, recipeId: recipeMedia.recipeId })
    .from(recipeMedia)
    .innerJoin(media, assetJoin)
    .where(
      and(
        inArray(recipeMedia.id, imageIds),
        eq(recipeMedia.householdId, householdId),
        isNotNull(media.confirmedAt),
        isNull(recipeMedia.deletedAt),
        isNull(media.deletedAt),
        eq(media.kind, "image"),
        exists(
          tx
            .select({ id: recipes.id })
            .from(recipes)
            .where(
              and(
                eq(recipes.householdId, householdId),
                eq(recipes.id, recipeMedia.recipeId),
                isNull(recipes.deletedAt),
              ),
            ),
        ),
      ),
    )
    .for("share");
}

export async function findRecipeImageForShare(
  tx: DatabaseTransaction,
  input: RecipeImageInput,
) {
  const [image] = await scopedImageQuery(tx, input).for("share");
  return image;
}
export async function findRecipeImageForUpdate(
  tx: DatabaseTransaction,
  input: RecipeImageInput,
) {
  const [image] = await scopedImageQuery(tx, input).for("update");
  return image;
}
export const findRecipeImageObjectForShare = findRecipeImageForShare;
export const findRecipeImageObjectForUpdate = findRecipeImageForUpdate;
