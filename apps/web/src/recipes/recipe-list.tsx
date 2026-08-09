import { queries } from "@home-hub/shared/zero/queries";
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
  const selectedRecipeId =
    selection?.householdId === householdId ? selection.recipeId : undefined;

  if (result.type === "unknown") {
    return <p>Loading recipe list…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load the recipe list.</p>;
  }

  return (
    <>
      <CreateRecipeForm householdId={householdId} />
      {recipes.length === 0 ? (
        <p>There are no recipes yet.</p>
      ) : (
        <ul>
          {recipes.map((recipe) => {
            return (
              <li key={recipe.id}>
                <button
                  type="button"
                  aria-pressed={selectedRecipeId === recipe.id}
                  onClick={() =>
                    setSelection({ householdId, recipeId: recipe.id })
                  }
                >
                  {recipe.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedRecipeId ? (
        <RecipeDetail
          accessToken={accessToken}
          householdId={householdId}
          recipeId={selectedRecipeId}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
    </>
  );
}
