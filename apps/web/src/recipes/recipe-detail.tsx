import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { AddRecipeIngredientForm } from "./add-recipe-ingredient-form";
import { RecipeDetailsEditor } from "./recipe-details-editor";
import {
  RecipeImageGallery,
  RecipeImageThumbnail,
  RecipeImageViewer,
} from "./recipe-image-gallery";
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
  const [selectedImage, setSelectedImage] = useState<RecipeImage>();
  const [recipe, result] = useQuery(
    queries.recipes.detail({ householdId, recipeId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load recipe details.
      </InlineAlert>
    );
  }

  if (!recipe && result.type === "complete") {
    return (
      <InlineAlert role="alert" variant="danger">
        Recipe not found.
      </InlineAlert>
    );
  }

  if (!recipe) return null;

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
    <article className="grid gap-8" aria-busy={result.type !== "complete"}>
      <section className="grid gap-4" aria-labelledby="recipe-photos-heading">
        <RecipeImageGallery
          accessToken={accessToken}
          householdId={householdId}
          recipeId={recipeId}
          images={recipe.images}
          onSessionExpired={onSessionExpired}
          onOpen={setSelectedImage}
          addControl={
            <RecipeImageUploadForm
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipeId}
              position={nextImagePosition}
              onSessionExpired={onSessionExpired}
            />
          }
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section
          className="grid content-start gap-4"
          aria-labelledby="ingredients-heading"
        >
          <h3 id="ingredients-heading" className="text-lg font-semibold">
            Ingredients
          </h3>
          <AddRecipeIngredientForm
            householdId={householdId}
            recipeId={recipeId}
            position={nextIngredientPosition}
          />
          {recipe.ingredients.length === 0 ? (
            <p className="text-sm text-muted">There are no ingredients yet.</p>
          ) : (
            <ol className="divide-y divide-border">
              {recipe.ingredients.map((ingredient) => (
                <li
                  key={ingredient.id}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-2 py-2"
                >
                  <span className="min-w-0">{ingredient.name}</span>
                  <span className="text-sm text-muted">
                    {[ingredient.quantity, ingredient.unit]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-label="Recipe information">
          <RecipeDetailsEditor
            householdId={householdId}
            recipeId={recipeId}
            currentTitle={recipe.title}
            currentDescription={recipe.description}
          />
        </section>
      </div>

      <section className="grid gap-4" aria-labelledby="cooking-history-heading">
        <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
        {recipe.cookLogs.length === 0 ? (
          <p className="text-sm text-muted">
            This recipe has not been cooked yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recipe.cookLogs.map((cookLog) => {
              const cookedAt = new Date(cookLog.cookedAt);
              const images = recipe.images.filter(
                (image) => image.cookLogId === cookLog.id,
              );

              return (
                <li key={cookLog.id} className="grid gap-3 py-5">
                  <time
                    dateTime={cookedAt.toISOString()}
                    className="text-sm font-medium text-foreground"
                  >
                    {dateTimeFormatter.format(cookedAt)}
                  </time>
                  <p className="whitespace-pre-wrap text-sm text-muted">
                    {cookLog.comment || "No comment"}
                  </p>
                  {images.length > 0 ? (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                      {images.map((image) => (
                        <RecipeImageThumbnail
                          key={image.id}
                          accessToken={accessToken}
                          householdId={householdId}
                          recipeId={recipeId}
                          image={image}
                          onSessionExpired={onSessionExpired}
                          onOpen={setSelectedImage}
                        />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RecipeImageViewer
        accessToken={accessToken}
        householdId={householdId}
        recipeId={recipeId}
        image={selectedImage}
        onSessionExpired={onSessionExpired}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(undefined);
        }}
      />
    </article>
  );
}
