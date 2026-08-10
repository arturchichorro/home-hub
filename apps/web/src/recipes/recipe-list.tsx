import { queries } from "@home-hub/shared/zero/queries";
import {
  InlineAlert,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { CreateRecipeForm } from "./create-recipe-form";
import { RecipeDetail } from "./recipe-detail";

type RecipeListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

export function RecipeList({
  accessToken,
  householdId,
  onSessionExpired,
}: RecipeListProps) {
  const [selection, setSelection] = useState<{
    householdId: string;
    recipeId: string;
  }>();
  const [recipes, result] = useQuery(
    queries.recipes.byHousehold({ householdId }),
  );
  const explicitlySelectedRecipeId =
    selection?.householdId === householdId ? selection.recipeId : undefined;

  if (result.type === "unknown") {
    return <InlineAlert>Loading recipes…</InlineAlert>;
  }

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load recipes.
      </InlineAlert>
    );
  }

  const selectedRecipe =
    recipes.find((recipe) => recipe.id === explicitlySelectedRecipeId) ??
    recipes[0];

  return (
    <div className="grid gap-8">
      <CreateRecipeForm householdId={householdId} />

      {selectedRecipe ? (
        <>
          <MenuRoot>
            <MenuTrigger
              aria-label={`Choose recipe. Current recipe: ${selectedRecipe.title}`}
              className="w-full max-w-sm justify-between!"
            >
              <span className="truncate">{selectedRecipe.title}</span>
              <span aria-hidden="true">⌄</span>
            </MenuTrigger>
            <MenuPopup className="w-(--anchor-width)">
              <MenuRadioGroup
                value={selectedRecipe.id}
                onValueChange={(recipeId) =>
                  setSelection({ householdId, recipeId })
                }
              >
                {recipes.map((recipe) => (
                  <MenuRadioItem key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </MenuRoot>

          <RecipeDetail
            accessToken={accessToken}
            householdId={householdId}
            recipeId={selectedRecipe.id}
            onSessionExpired={onSessionExpired}
          />
        </>
      ) : (
        <p className="text-sm text-muted">There are no recipes yet.</p>
      )}
    </div>
  );
}
