import type { Database } from "@home-hub/database";
import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { authorizeModule } from "../../authorization/module-access";
import type { SignRead } from "./create-read-url";
import { findConfirmedHouseholdRecipeImagesForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

export type CreateRecipeImageReadUrlsInput = {
  principal: ZeroAuthContext;
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
    principal,
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
      const denied = await authorizeModule(tx, {
        principal,
        householdId,
        moduleKey: "recipes",
        write: false,
      });
      if (denied) return { kind: denied };

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
