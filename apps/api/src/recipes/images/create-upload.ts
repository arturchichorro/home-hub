import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { media, recipeMedia } from "@home-hub/database/schema";
import { mediaOriginalObjectKey } from "@home-hub/shared/media-delivery";
import { appendSortKey } from "@home-hub/shared/ordering";
import type {
  CreateRecipeImageUploadRequest,
  RecipeImageContentType,
} from "@home-hub/shared/recipe-images";
import { and, asc, eq, isNull } from "drizzle-orm";
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

export function createRecipeImageObjectKey({
  householdId,
  imageId,
}: {
  householdId: string;
  imageId: string;
  recipeId?: string;
}) {
  return mediaOriginalObjectKey({
    householdId,
    mediaId: imageId,
    storageRecipeId: null,
  });
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
      const [bottom] = await tx
        .select({ sortKey: recipeMedia.sortKey })
        .from(recipeMedia)
        .where(
          and(
            eq(recipeMedia.householdId, householdId),
            eq(recipeMedia.recipeId, recipeId),
            isNull(recipeMedia.deletedAt),
          ),
        )
        .orderBy(asc(recipeMedia.sortKey), recipeMedia.id)
        .limit(1)
        .execute();
      const sortKey = appendSortKey(bottom?.sortKey);

      const [asset] = await tx
        .insert(media)
        .values({
          id: imageId,
          householdId,
          kind: "image",
          objectKey,
          contentType,
          byteSize,
          width,
          height,
          confirmedAt: null,
          deletedAt: null,
        })
        .returning({ id: media.id });
      if (!asset) throw new Error("Pending media insert returned no row");
      const [image] = await tx
        .insert(recipeMedia)
        .values({
          id: imageId,
          householdId,
          recipeId,
          cookLogId,
          mediaId: asset.id,
          sortKey,
          deletedAt: null,
        })
        .returning({ id: recipeMedia.id });
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
