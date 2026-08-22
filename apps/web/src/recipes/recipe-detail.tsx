import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  Collapsible,
  CookingPot,
  ErrorPopover,
  History,
  InlineAlert,
  Input,
  Textarea,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { deleteRecipeImage } from "./image-api";
import { RecipeCookingHistoryList } from "./recipe-cooking-history-list";
import { RecipeImageGallery, RecipeImageViewer } from "./recipe-image-gallery";
import { RecipeImageUploadForm } from "./recipe-image-upload-form";
import { invalidateRecipeImageUrl } from "./recipe-image-url-cache";
import { RecipeIngredientList } from "./recipe-ingredient-list";
import { useRecipeDetailsEditor } from "./use-recipe-details-editor";

type RecipeDetailProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

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
  const [selectedCookLogIds, setSelectedCookLogIds] = useState<
    readonly string[] | null
  >(null);
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

  const nextImagePosition =
    recipe.images.reduce(
      (highestPosition, image) => Math.max(highestPosition, image.position),
      -1,
    ) + 1;
  const visibleImages = recipe.images.filter(
    (image) => !hiddenImageIds.has(image.id),
  );
  const viewerImages = selectedCookLogIds
    ? visibleImages.filter(
        (image) =>
          image.cookLogId !== null &&
          selectedCookLogIds.includes(image.cookLogId),
      )
    : visibleImages;

  function openGalleryImage(image: RecipeImage) {
    setSelectedCookLogIds(null);
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
      if (deletion.kind === "success") {
        invalidateRecipeImageUrl({ householdId, recipeId, imageId: image.id });
      } else {
        restoreImage();
      }
    } catch {
      restoreImage();
    }
  }

  return (
    <article className="grid gap-2" aria-busy={result.type !== "complete"}>
      <Input
        {...editor.titleProps}
        appearance="seamless"
        aria-label="Recipe title"
        className="text-2xl font-semibold text-primary"
        maxLength={150}
      />
      <Textarea
        {...editor.descriptionProps}
        appearance="seamless"
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

      <Collapsible
        title={
          <span className="flex items-center gap-2">
            <CookingPot aria-hidden="true" className="size-5" />
            Ingredients
          </span>
        }
      >
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted">There are no ingredients yet.</p>
        ) : null}
        <RecipeIngredientList
          householdId={householdId}
          recipeId={recipeId}
          ingredients={recipe.ingredients}
        />
      </Collapsible>

      <Collapsible
        title={
          <span className="flex items-center gap-2">
            <History aria-hidden="true" className="size-5" />
            Cooking history
          </span>
        }
      >
        <div>
          <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
          {recipe.cookLogs.length === 0 ? (
            <p className="border-t border-border py-2 text-sm text-muted">
              This recipe has not been cooked yet.
            </p>
          ) : (
            <RecipeCookingHistoryList
              accessToken={accessToken}
              cookLogs={recipe.cookLogs}
              householdId={householdId}
              images={visibleImages}
              nextImagePosition={nextImagePosition}
              recipeId={recipeId}
              onOpenImage={(image, cookLogIds) => {
                setSelectedCookLogIds(cookLogIds);
                setSelectedImage(image);
              }}
              onSessionExpired={onSessionExpired}
            />
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
