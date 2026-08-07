import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

type RecipeListProps = {
  householdId: string;
};

export function RecipeList({ householdId }: RecipeListProps) {
  const [recipes, result] = useQuery(
    queries.recipes.byHousehold({ householdId }),
  );

  if (result.type === "unknown") {
    return <p>Loading recipe list…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load the recipe list.</p>;
  }

  return (
    <>
      {recipes.length === 0 ? (
        <p>There are no recipes yet.</p>
      ) : (
        <ul>
          {recipes.map((recipe) => {
            return <li key={recipe.id}>{recipe.title}</li>;
          })}
        </ul>
      )}
    </>
  );
}
