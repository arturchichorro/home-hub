import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { AddRecipeIngredientForm } from "./add-recipe-ingredient-form";

type RecipeDetailProps = {
  householdId: string;
  recipeId: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RecipeDetail({ householdId, recipeId }: RecipeDetailProps) {
  const [recipe, result] = useQuery(
    queries.recipes.detail({ householdId, recipeId }),
  );

  if (result.type === "unknown") {
    return <p>Loading recipe details…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load recipe details.</p>;
  }

  if (!recipe) {
    return <p role="alert">Recipe not found.</p>;
  }

  const nextIngredientPosition =
    recipe.ingredients.reduce(
      (highestPosition, ingredient) =>
        Math.max(highestPosition, ingredient.position),
      -1,
    ) + 1;

  return (
    <article>
      <h3>{recipe.title}</h3>
      {recipe.description ? <p>{recipe.description}</p> : null}

      <h4>Ingredients</h4>
      <AddRecipeIngredientForm
        householdId={householdId}
        recipeId={recipeId}
        position={nextIngredientPosition}
      />
      {recipe.ingredients.length === 0 ? (
        <p>There are no ingredients yet.</p>
      ) : (
        <ol>
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              {ingredient.quantity ? `${ingredient.quantity} ` : null}
              {ingredient.unit ? `${ingredient.unit} ` : null}
              {ingredient.name}
              {ingredient.note ? ` — ${ingredient.note}` : null}
            </li>
          ))}
        </ol>
      )}

      <h4>Cooking history</h4>
      <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
      {recipe.cookLogs.length === 0 ? (
        <p>This recipe has not been cooked yet.</p>
      ) : (
        <ul>
          {recipe.cookLogs.map((cookLog) => {
            const cookedAt = new Date(cookLog.cookedAt);

            return (
              <li key={cookLog.id}>
                <time dateTime={cookedAt.toISOString()}>
                  {dateTimeFormatter.format(cookedAt)}
                </time>
                {cookLog.comment ? ` — ${cookLog.comment}` : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
