import type { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
} from "@home-hub/database/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

type Database = ReturnType<typeof createDbClient>["db"];

type SignRead = (input: { objectKey: string }) => Promise<string>;

export type CreateRecipeImageReadUrlInput = {
  userId: string;
  householdId: string;
  recipeId: string;
  imageId: string;
};

export type CreateRecipeImageReadUrlResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | {
      kind: "success";
      url: string;
      expiresInSeconds: number;
    };

export function createRecipeImageReadUrlService({
  db,
  signRead,
}: {
  db: Database;
  signRead: SignRead;
}) {
  return async function createRecipeImageReadUrl({
    userId,
    householdId,
    recipeId,
    imageId,
  }: CreateRecipeImageReadUrlInput): Promise<CreateRecipeImageReadUrlResult> {
    const authorizedImage = await db.transaction(async (tx) => {
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
            isNotNull(recipeImages.confirmedAt),
          ),
        )
        .limit(1)
        .for("share");
      if (!image) return { kind: "not_found" as const };

      return { kind: "image" as const, objectKey: image.objectKey };
    });

    if (authorizedImage.kind !== "image") return authorizedImage;

    return {
      kind: "success",
      url: await signRead({ objectKey: authorizedImage.objectKey }),
      expiresInSeconds: recipeImageReadUrlLifetimeSeconds,
    };
  };
}
