import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  recipeCookLogs,
  recipeImages,
  recipes,
} from "@home-hub/database/schema";
import type {
  CreateRecipeImageUploadRequest,
  RecipeImageContentType,
} from "@home-hub/shared/recipe-images";
import { and, eq } from "drizzle-orm";
import { recipeImageUploadUrlLifetimeSeconds } from "./sign-upload";

type Database = ReturnType<typeof createDbClient>["db"];

type SignUpload = (input: {
  objectKey: string;
  contentType: RecipeImageContentType;
}) => Promise<string>;

export type CreateRecipeImageUploadInput = CreateRecipeImageUploadRequest & {
  userId: string;
  householdId: string;
  recipeId: string;
};

export type CreateRecipeImageUploadResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | {
      kind: "success";
      imageId: string;
      uploadUrl: string;
      uploadUrlExpiresInSeconds: number;
    };

export function createRecipeImageObjectKey({
  householdId,
  recipeId,
  imageId,
}: {
  householdId: string;
  recipeId: string;
  imageId: string;
}): string {
  return `households/${householdId}/recipes/${recipeId}/${imageId}`;
}

export function createRecipeImageUploadService({
  db,
  signUpload,
}: {
  db: Database;
  signUpload: SignUpload;
}) {
  return async function createRecipeImageUpload({
    userId,
    householdId,
    recipeId,
    cookLogId,
    contentType,
    byteSize,
    width,
    height,
    position,
  }: CreateRecipeImageUploadInput): Promise<CreateRecipeImageUploadResult> {
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

      const [recipe] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(
          and(eq(recipes.householdId, householdId), eq(recipes.id, recipeId)),
        )
        .limit(1)
        .for("share");
      if (!recipe) return { kind: "not_found" };

      if (cookLogId !== null) {
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
        if (!cookLog) return { kind: "not_found" };
      }

      const imageId = randomUUID();
      const objectKey = createRecipeImageObjectKey({
        householdId,
        recipeId,
        imageId,
      });

      const [image] = await tx
        .insert(recipeImages)
        .values({
          id: imageId,
          householdId,
          recipeId,
          cookLogId,
          objectKey,
          contentType,
          byteSize,
          width,
          height,
          position,
          confirmedAt: null,
        })
        .returning({ id: recipeImages.id });
      if (!image)
        throw new Error("Pending recipe image insert returned no row");

      const uploadUrl = await signUpload({ objectKey, contentType });

      return {
        kind: "success",
        imageId: image.id,
        uploadUrl,
        uploadUrlExpiresInSeconds: recipeImageUploadUrlLifetimeSeconds,
      };
    });
  };
}
