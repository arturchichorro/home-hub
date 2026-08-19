import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  Collapsible,
  ErrorPopover,
  InlineAlert,
  Input,
  Textarea,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { AddRecipeIngredientForm } from "./add-recipe-ingredient-form";
import {
  RecipeImageGallery,
  RecipeImageThumbnail,
  RecipeImageViewer,
} from "./recipe-image-gallery";
import { RecipeImageUploadForm } from "./recipe-image-upload-form";
import { useRecipeDetailsEditor } from "./use-recipe-details-editor";

type RecipeDetailProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function RecipeDetail({
  accessToken,
  householdId,
  recipeId,
  onSessionExpired,
}: RecipeDetailProps) {
  const [selectedImage, setSelectedImage] = useState<RecipeImage>();
  const [selectedCookLogId, setSelectedCookLogId] = useState<string | null>(
    null,
  );
  const [recipe, result] = useQuery(
    queries.recipes.detail({ householdId, recipeId }),
  );
  const editor = useRecipeDetailsEditor({
    householdId,
    recipeId,
    currentTitle: recipe?.title ?? "",
    currentDescription: recipe?.description ?? null,
  });

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
  const viewerImages = selectedCookLogId
    ? recipe.images.filter((image) => image.cookLogId === selectedCookLogId)
    : recipe.images;

  function openGalleryImage(image: RecipeImage) {
    setSelectedCookLogId(null);
    setSelectedImage(image);
  }

  return (
    <article className="grid gap-2" aria-busy={result.type !== "complete"}>
      <Input
        {...editor.titleProps}
        appearance="inline"
        aria-label="Recipe title"
        className="text-2xl font-semibold text-primary"
        maxLength={150}
      />
      <Textarea
        {...editor.descriptionProps}
        appearance="inline"
        aria-label="Recipe description"
        maxLength={5_000}
        placeholder="Add a description…"
        rows={1}
      />
      <RecipeImageGallery
        accessToken={accessToken}
        householdId={householdId}
        recipeId={recipeId}
        images={recipe.images}
        onSessionExpired={onSessionExpired}
        onOpen={openGalleryImage}
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
      <ErrorPopover {...editor.errorPopoverProps}>{editor.error}</ErrorPopover>

      <Collapsible title="Ingredients">
        <AddRecipeIngredientForm
          householdId={householdId}
          recipeId={recipeId}
          position={nextIngredientPosition}
        />
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted">There are no ingredients yet.</p>
        ) : (
          <ol className="divide-y border-t divide-border border-border">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="flex justify-between gap-4 p-2"
              >
                <span>{ingredient.name}</span>
                <span className="text-sm text-muted">
                  {[ingredient.quantity, ingredient.unit]
                    .filter(Boolean)
                    .join(" ") || ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Collapsible>

      <Collapsible title="Cooking history">
        <div className="space-y-4">
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
                  <li key={cookLog.id} className="space-y-3 py-5">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      <time
                        dateTime={cookedAt.toISOString()}
                        className="text-sm font-medium"
                      >
                        {dateFormatter.format(cookedAt)}
                      </time>
                      <p className="whitespace-pre-wrap text-sm text-muted">
                        {cookLog.comment || "No comment"}
                      </p>
                      <RecipeImageUploadForm
                        accessToken={accessToken}
                        appearance="subtle"
                        cookLogId={cookLog.id}
                        householdId={householdId}
                        recipeId={recipeId}
                        position={nextImagePosition}
                        onSessionExpired={onSessionExpired}
                      />
                    </div>
                    {images.length > 0 ? (
                      <ul className="flex min-w-0 gap-2 overflow-x-auto">
                        {images.map((image) => (
                          <RecipeImageThumbnail
                            key={image.id}
                            accessToken={accessToken}
                            householdId={householdId}
                            recipeId={recipeId}
                            image={image}
                            className="size-12 shrink-0"
                            onSessionExpired={onSessionExpired}
                            onOpen={(image) => {
                              setSelectedCookLogId(cookLog.id);
                              setSelectedImage(image);
                            }}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Collapsible>

      <RecipeImageViewer
        accessToken={accessToken}
        householdId={householdId}
        recipeId={recipeId}
        image={selectedImage}
        images={viewerImages}
        onSessionExpired={onSessionExpired}
        onSelect={setSelectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(undefined);
        }}
      />
    </article>
  );
}
