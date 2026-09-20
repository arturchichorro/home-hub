import type { Database } from "@home-hub/database";
import type { RecipeImageVariant } from "@home-hub/shared/recipe-image-delivery";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { authorizeModule } from "../../authorization/module-access";
import { findConfirmedRecipeImageForShare } from "./scoped-entities";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

export type SignRead = (input: {
  householdId: string;
  imageId: string;
  recipeId: string;
  variant: RecipeImageVariant;
}) => Promise<string>;

export type CreateRecipeImageReadUrlInput = {
  principal: ZeroAuthContext;
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
  return async function createRecipeImageReadUrl({
    principal,
    householdId,
    recipeId,
    imageId,
    variant,
  }: CreateRecipeImageReadUrlInput): Promise<CreateRecipeImageReadUrlResult> {
    const authorizedImage = await db.transaction(async (tx) => {
      const denied = await authorizeModule(tx, {
        principal,
        householdId,
        moduleKey: "recipes",
        write: false,
      });
      if (denied) return { kind: denied };

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
