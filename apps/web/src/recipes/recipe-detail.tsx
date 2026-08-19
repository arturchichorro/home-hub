import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  Collapsible,
  ConfirmationPopover,
  ErrorPopover,
  IconButton,
  InlineAlert,
  Input,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { AddRecipeIngredientForm } from "./add-recipe-ingredient-form";
import { deleteRecipeImage } from "./image-api";
import {
  RecipeImageGallery,
  RecipeImageThumbnail,
  RecipeImageViewer,
} from "./recipe-image-gallery";
import { RecipeImageUploadForm } from "./recipe-image-upload-form";
import { RecipeIngredientList } from "./recipe-ingredient-list";
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
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [selectedImage, setSelectedImage] = useState<RecipeImage>();
  const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const visibleImages = recipe.images.filter(
    (image) => !hiddenImageIds.has(image.id),
  );
  const viewerImages = selectedCookLogId
    ? visibleImages.filter((image) => image.cookLogId === selectedCookLogId)
    : visibleImages;

  function openGalleryImage(image: RecipeImage) {
    setSelectedCookLogId(null);
    setSelectedImage(image);
  }

  function reorderImages(orderedImageIds: string[]) {
    if (!mutationEnabled) return;
    zero.mutate(
      mutators.recipes.reorderImages({
        householdId,
        recipeId,
        orderedImageIds,
        optimisticUpdatedAt: Date.now(),
      }),
    );
  }

  function deleteCookLog(cookLogId: string) {
    if (!mutationEnabled) return;
    zero.mutate(
      mutators.recipes.deleteCookLog({ householdId, recipeId, cookLogId }),
    );
  }

  async function deleteImage(image: RecipeImage) {
    setHiddenImageIds((current) => new Set(current).add(image.id));
    setSelectedImage(undefined);

    const restoreImage = () =>
      setHiddenImageIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });

    try {
      const deletion = await deleteRecipeImage({
        accessToken,
        householdId,
        recipeId,
        imageId: image.id,
      });
      if (deletion.kind === "unauthorized") onSessionExpired();
      if (deletion.kind !== "success") restoreImage();
    } catch {
      restoreImage();
    }
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
        images={visibleImages}
        onSessionExpired={onSessionExpired}
        onOpen={openGalleryImage}
        onReorder={reorderImages}
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
          <RecipeIngredientList
            householdId={householdId}
            recipeId={recipeId}
            ingredients={recipe.ingredients}
          />
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
            <ul>
              {recipe.cookLogs.map((cookLog) => {
                const cookedAt = new Date(cookLog.cookedAt);
                const images = visibleImages.filter(
                  (image) => image.cookLogId === cookLog.id,
                );

                return (
                  <li key={cookLog.id} className="py-2">
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
                      <div className="flex items-center gap-1">
                        <RecipeImageUploadForm
                          accessToken={accessToken}
                          appearance="subtle"
                          cookLogId={cookLog.id}
                          householdId={householdId}
                          recipeId={recipeId}
                          position={nextImagePosition}
                          onSessionExpired={onSessionExpired}
                        />
                        <ConfirmationPopover
                          title="Delete cooking log?"
                          description="Its pictures will remain in the recipe gallery."
                          trigger={
                            <IconButton
                              aria-label="Delete cooking log"
                              className="size-7!"
                              disabled={!mutationEnabled}
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </IconButton>
                          }
                          onConfirm={() => deleteCookLog(cookLog.id)}
                        />
                      </div>
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
        onDelete={(image) => void deleteImage(image)}
        onSessionExpired={onSessionExpired}
        onSelect={setSelectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(undefined);
        }}
      />
    </article>
  );
}
