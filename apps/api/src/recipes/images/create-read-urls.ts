import type { Database } from "@home-hub/database";
import type { RequestAccess } from "@home-hub/shared/access";
import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { authorizeHouseholdModule } from "../../authorization/module-access";
import type { SignRead } from "./create-read-url";
import { findConfirmedHouseholdRecipeImagesForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

export type CreateRecipeImageReadUrlsInput = {
  requestAccess: RequestAccess;
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
  return async function createRecipeImageReadUrls(
    input: CreateRecipeImageReadUrlsInput,
  ): Promise<CreateRecipeImageReadUrlsResult> {
    const { householdId, requests } = input;
    const uniqueRequests = Array.from(
      new Map(
        requests.map((request) => [
          `${request.recipeId}:${request.imageId}:${request.variant}`,
          request,
        ]),
      ).values(),
    );
    const authorizedImageIds = await db.transaction(async (tx) => {
      const failure = await authorizeHouseholdModule(tx, {
        requestAccess: input.requestAccess,
        householdId,
        moduleKey: "recipes",
        write: false,
      });
      if (failure) return { kind: failure };

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
