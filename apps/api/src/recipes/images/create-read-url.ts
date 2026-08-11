import type { Database } from "@home-hub/database";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import { findConfirmedRecipeImageForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

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

      const image = await findConfirmedRecipeImageForShare(tx, {
        householdId,
        recipeId,
        imageId,
      });
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
