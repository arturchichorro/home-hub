import type { Database } from "@home-hub/database";
import type { RequestAccess } from "@home-hub/shared/access";
import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import { authorizeHouseholdModule } from "../../authorization/module-access";
import { findConfirmedRecipeImageForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

export type SignRead = (input: {
  householdId: string;
  imageId: string;
  recipeId: string;
  variant: RecipeImageVariant;
}) => Promise<string>;

export type CreateRecipeImageReadUrlInput = {
  requestAccess: RequestAccess;
  householdId: string;
  recipeId: string;
  imageId: string;
  variant: RecipeImageVariant;
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
  return async function createRecipeImageReadUrl(
    input: CreateRecipeImageReadUrlInput,
  ): Promise<CreateRecipeImageReadUrlResult> {
    const { householdId, recipeId, imageId, variant } = input;
    const authorizedImage = await db.transaction(async (tx) => {
      const failure = await authorizeHouseholdModule(tx, {
        requestAccess: input.requestAccess,
        householdId,
        moduleKey: "recipes",
        write: false,
      });
      if (failure) return { kind: failure };

      const image = await findConfirmedRecipeImageForShare(tx, {
        householdId,
        recipeId,
        imageId,
      });
      if (!image) return { kind: "not_found" as const };

      return { kind: "image" as const };
    });

    if (authorizedImage.kind !== "image") return authorizedImage;

    return {
      kind: "success",
      url: await signRead({ householdId, imageId, recipeId, variant }),
      expiresInSeconds: recipeImageReadUrlLifetimeSeconds,
    };
  };
}
