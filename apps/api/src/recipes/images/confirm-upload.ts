import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
} from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import type { InspectR2ObjectResult } from "./inspect-object";

type InspectObject = (input: {
  objectKey: string;
}) => Promise<InspectR2ObjectResult | null>;

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
}: {
  db: Database;
  inspectObject: InspectObject;
}) {
  return async function confirmRecipeImageUpload({
    userId,
    householdId,
    recipeId,
    imageId,
  }: ConfirmRecipeImageUploadInput): Promise<ConfirmRecipeImageUploadResult> {
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
        .select({
          id: recipeImages.id,
          objectKey: recipeImages.objectKey,
          contentType: recipeImages.contentType,
          byteSize: recipeImages.byteSize,
          confirmedAt: recipeImages.confirmedAt,
        })
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
        .select({
          id: recipeImages.id,
          objectKey: recipeImages.objectKey,
          contentType: recipeImages.contentType,
          byteSize: recipeImages.byteSize,
          confirmedAt: recipeImages.confirmedAt,
        })
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
