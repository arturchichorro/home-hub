import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { AddRecipeIngredientForm } from "./add-recipe-ingredient-form";
import { RecipeImageGallery } from "./recipe-image-gallery";
import { RecipeImageUploadForm } from "./recipe-image-upload-form";

type RecipeDetailProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RecipeDetail({
  accessToken,
  householdId,
  recipeId,
  onSessionExpired,
}: RecipeDetailProps) {
  const [recipe, result] = useQuery(
    queries.recipes.detail({ householdId, recipeId }),
  );

  if (result.type === "unknown") {
    return <InlineAlert>Loading recipe details…</InlineAlert>;
  }

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load recipe details.
      </InlineAlert>
    );
  }

  if (!recipe) {
    return (
      <InlineAlert role="alert" variant="danger">
        Recipe not found.
      </InlineAlert>
    );
  }

  const nextIngredientPosition =
    recipe.ingredients.reduce(
      (highestPosition, ingredient) =>
        Math.max(highestPosition, ingredient.position),
      -1,
    ) + 1;
  const nextImagePosition =
    recipe.images.reduce(
      (highestPosition, image) => Math.max(highestPosition, image.position),
      -1,
    ) + 1;

  return (
    <article className="grid gap-8">
      <header>
        <h3 className="text-2xl font-semibold">{recipe.title}</h3>
        {recipe.description ? (
          <p className="mt-2 max-w-2xl text-muted">{recipe.description}</p>
        ) : null}
      </header>

      <section className="grid gap-5 border-t border-border pt-6">
        <h4 className="text-lg font-semibold">Photos</h4>
        <RecipeImageUploadForm
          accessToken={accessToken}
          householdId={householdId}
          recipeId={recipeId}
          cookLogs={recipe.cookLogs}
          position={nextImagePosition}
          onSessionExpired={onSessionExpired}
        />
        <RecipeImageGallery
          accessToken={accessToken}
          householdId={householdId}
          recipeId={recipeId}
          images={recipe.images}
          onSessionExpired={onSessionExpired}
        />
      </section>

      <section className="grid gap-5 border-t border-border pt-6">
        <h4 className="text-lg font-semibold">Ingredients</h4>
        <AddRecipeIngredientForm
          householdId={householdId}
          recipeId={recipeId}
          position={nextIngredientPosition}
        />
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted">There are no ingredients yet.</p>
        ) : (
          <ol className="divide-y divide-border border-y border-border">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[2rem_9rem_minmax(0,1fr)]"
              >
                <span className="text-sm text-muted">
                  {ingredient.position + 1}.
                </span>
                <span className="text-sm text-muted">
                  {[ingredient.quantity, ingredient.unit]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </span>
                <span className="min-w-0">
                  <span>{ingredient.name}</span>
                  {ingredient.note ? (
                    <span className="mt-1 block text-sm text-muted">
                      {ingredient.note}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-5 border-t border-border pt-6">
        <h4 className="text-lg font-semibold">Cooking history</h4>
        <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
        {recipe.cookLogs.length === 0 ? (
          <p className="text-sm text-muted">
            This recipe has not been cooked yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {recipe.cookLogs.map((cookLog) => {
              const cookedAt = new Date(cookLog.cookedAt);

              return (
                <li
                  key={cookLog.id}
                  className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4"
                >
                  <time
                    dateTime={cookedAt.toISOString()}
                    className="text-sm text-foreground"
                  >
                    {dateTimeFormatter.format(cookedAt)}
                  </time>
                  <span className="text-sm text-muted">
                    {cookLog.comment || "No comment"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
