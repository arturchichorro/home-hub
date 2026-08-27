import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import type { InspectR2ObjectResult } from "./inspect-object";
import {
  findRecipeImageForShare,
  findRecipeImageForUpdate,
} from "./scoped-entities";

type InspectObject = (input: {
  objectKey: string;
}) => Promise<InspectR2ObjectResult | null>;

type ProcessDerivatives = (input: {
  householdId: string;
  imageId: string;
  recipeId: string;
}) => Promise<void>;

export type ConfirmRecipeImageUploadInput = {
  userId: string;
  householdId: string;
  recipeId: string;
  imageId: string;
};

export type ConfirmRecipeImageUploadResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "upload_not_found" }
  | { kind: "invalid_upload" }
  | { kind: "success"; image: { id: string; confirmedAt: Date } };

export function createConfirmRecipeImageUploadService({
  db,
  inspectObject,
  processDerivatives,
}: {
  db: Database;
  inspectObject: InspectObject;
  processDerivatives: ProcessDerivatives;
}) {
  return async function confirmRecipeImageUpload({
    userId,
    householdId,
    recipeId,
    imageId,
  }: ConfirmRecipeImageUploadInput): Promise<ConfirmRecipeImageUploadResult> {
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

      const image = await findRecipeImageForShare(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "not_found" as const };

      return { kind: "image" as const, image };
    });

    if (initial.kind !== "image") return initial;
    if (initial.image.confirmedAt) {
      return {
        kind: "success",
        image: {
          id: initial.image.id,
          confirmedAt: initial.image.confirmedAt,
        },
      };
    }

    const object = await inspectObject({ objectKey: initial.image.objectKey });
    if (!object) return { kind: "upload_not_found" };
    if (
      object.contentType !== initial.image.contentType ||
      object.byteSize !== initial.image.byteSize
    ) {
      return { kind: "invalid_upload" };
    }

    await processDerivatives({ householdId, imageId, recipeId });

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

      const image = await findRecipeImageForUpdate(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "not_found" };

      if (image.confirmedAt) {
        const confirmedAt = image.confirmedAt;
        return {
          kind: "success",
          image: { id: image.id, confirmedAt },
        };
      }

      if (
        image.objectKey !== initial.image.objectKey ||
        image.contentType !== initial.image.contentType ||
        image.byteSize !== initial.image.byteSize
      ) {
        throw new Error("Pending recipe image changed during confirmation");
      }

      const confirmedAt = new Date();
      const [confirmedImage] = await tx
        .update(recipeImages)
        .set({ confirmedAt, updatedAt: confirmedAt })
        .where(
          and(
            eq(recipeImages.id, imageId),
            eq(recipeImages.householdId, householdId),
            eq(recipeImages.recipeId, recipeId),
          ),
        )
        .returning({
          id: recipeImages.id,
          confirmedAt: recipeImages.confirmedAt,
        });
      if (!confirmedImage?.confirmedAt) {
        throw new Error("Recipe image confirmation returned no row");
      }

      const persistedConfirmedAt = confirmedImage.confirmedAt;

      return {
        kind: "success",
        image: { id: confirmedImage.id, confirmedAt: persistedConfirmedAt },
      };
    });
  };
}
