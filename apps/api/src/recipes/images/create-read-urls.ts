import type { Database } from "@home-hub/database";
import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { findActiveUser } from "../../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../../authorization/household-access";
import type { SignRead } from "./create-read-url";
import { findConfirmedHouseholdRecipeImagesForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

export type CreateRecipeImageReadUrlsInput = {
  userId: string;
  householdId: string;
  requests: Array<{
    imageId: string;
    recipeId: string;
    variant: RecipeImageVariant;
  }>;
};

export type CreateRecipeImageReadUrlsResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | {
      kind: "success";
      reads: Array<{
        imageId: string;
        recipeId: string;
        variant: RecipeImageVariant;
        url: string;
        expiresInSeconds: number;
      }>;
    };

export function createRecipeImageReadUrlsService({
  db,
  signRead,
}: {
  db: Database;
  signRead: SignRead;
}) {
  return async function createRecipeImageReadUrls({
    userId,
    householdId,
    requests,
  }: CreateRecipeImageReadUrlsInput): Promise<CreateRecipeImageReadUrlsResult> {
    const uniqueRequests = Array.from(
      new Map(
        requests.map((request) => [
          `${request.recipeId}:${request.imageId}:${request.variant}`,
          request,
        ]),
      ).values(),
    );
    const authorizedImageIds = await db.transaction(async (tx) => {
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

      const images = await findConfirmedHouseholdRecipeImagesForShare(tx, {
        householdId,
        imageIds: Array.from(
          new Set(uniqueRequests.map((request) => request.imageId)),
        ),
      });
      return {
        kind: "images" as const,
        imageIds: new Set(
          images.map((image) => `${image.recipeId}:${image.id}`),
        ),
      };
    });

    if (authorizedImageIds.kind !== "images") return authorizedImageIds;

    const readableRequests = uniqueRequests.filter((request) =>
      authorizedImageIds.imageIds.has(`${request.recipeId}:${request.imageId}`),
    );
    return {
      kind: "success",
      reads: await Promise.all(
        readableRequests.map(async ({ imageId, recipeId, variant }) => ({
          imageId,
          recipeId,
          variant,
          url: await signRead({ householdId, imageId, recipeId, variant }),
          expiresInSeconds: recipeImageReadUrlLifetimeSeconds,
        })),
      ),
    };
  };
}
