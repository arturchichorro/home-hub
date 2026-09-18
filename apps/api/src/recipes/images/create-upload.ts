import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import { appendSortKey } from "@home-hub/shared/ordering";
import { recipeImageOriginalObjectKey } from "@home-hub/shared/recipe-image-delivery";
import type {
  CreateRecipeImageUploadRequest,
  RecipeImageContentType,
} from "@home-hub/shared/recipe-images";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  authorizeHouseholdModule,
  type PrincipalOrLegacyUser,
  resolvePrincipal,
} from "../../authorization/module-access";
import {
  findRecipeCookLogForShare,
  findRecipeForShare,
} from "./scoped-entities";
import { recipeImageUploadUrlLifetimeSeconds } from "./sign-upload";

type SignUpload = (input: {
  objectKey: string;
  contentType: RecipeImageContentType;
}) => Promise<string>;

export type CreateRecipeImageUploadInput = CreateRecipeImageUploadRequest &
  PrincipalOrLegacyUser & {
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
  return async function createRecipeImageUpload(
    input: CreateRecipeImageUploadInput,
  ): Promise<CreateRecipeImageUploadResult> {
    const {
      householdId,
      recipeId,
      cookLogId,
      contentType,
      byteSize,
      width,
      height,
    } = input;
    const principal = resolvePrincipal(input);
    return db.transaction(async (tx) => {
      const failure = await authorizeHouseholdModule(tx, {
        principal,
        householdId,
        moduleKey: "recipes",
        write: true,
      });
      if (failure) return { kind: failure };

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
        .select({ sortKey: recipeImages.sortKey })
        .from(recipeImages)
        .where(
          and(
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
            isNull(recipeImages.deletedAt),
          ),
        )
        .orderBy(asc(recipeImages.sortKey), recipeImages.id)
        .limit(1)
        .execute();
      const sortKey = appendSortKey(bottom?.sortKey);

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
          sortKey,
          confirmedAt: null,
          deletedAt: null,
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
