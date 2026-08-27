import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import { recipeImageOriginalObjectKey } from "@home-hub/shared/recipe-image-delivery";
import type {
  CreateRecipeImageUploadRequest,
  RecipeImageContentType,
} from "@home-hub/shared/recipe-images";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import {
  findRecipeCookLogForShare,
  findRecipeForShare,
} from "./scoped-entities";
import { recipeImageUploadUrlLifetimeSeconds } from "./sign-upload";

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

export const createRecipeImageObjectKey = recipeImageOriginalObjectKey;

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

      const recipe = await findRecipeForShare(tx, { householdId, recipeId });
      if (!recipe) return { kind: "not_found" };

      if (cookLogId !== null) {
        const cookLog = await findRecipeCookLogForShare(tx, {
          householdId,
          recipeId,
          cookLogId,
        });
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
