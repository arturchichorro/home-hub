import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  ConfirmationPopover,
  CookingPot,
  ErrorPopover,
  History,
  IconButton,
  Images,
  InlineAlert,
  Input,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { deleteRecipeImage } from "./image-api";
import {
  prefetchRecipeImage,
  scheduleIdleRecipeImagePrefetch,
} from "./prefetch-recipe-image";
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
  userId: string;
};

export function RecipeDetail({
  accessToken,
  householdId,
  recipeId,
  onSessionExpired,
  userId,
}: RecipeDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const mutationEnabled = useZeroMutationEnabled();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
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
  const firstVisibleImageId = recipe?.images.find(
    (image) => !hiddenImageIds.has(image.id),
  )?.id;

  useEffect(() => {
    if (!firstVisibleImageId) return;
    return scheduleIdleRecipeImagePrefetch(() => {
      void prefetchRecipeImage({
        accessToken,
        userId,
        householdId,
        imageId: firstVisibleImageId,
        recipeId,
        variant: "viewer",
      }).then((prefetch) => {
        if (prefetch.kind === "unauthorized") onSessionExpired();
      });
    });
  }, [
    accessToken,
    firstVisibleImageId,
    householdId,
    onSessionExpired,
    recipeId,
    userId,
  ]);

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load recipe details.
      </InlineAlert>
    );
  }

  if (!recipe && result.type === "complete" && !deleting) {
    return (
      <InlineAlert role="alert" variant="danger">
        Recipe not found.
      </InlineAlert>
    );
  }

  if (!recipe) {
    return deleting ? <p className="text-muted">Deleting recipe…</p> : null;
  }

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

  async function deleteRecipe() {
    if (deleting || !mutationEnabled) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.recipes.delete({
          householdId,
          recipeId,
          optimisticDeletedAt: Date.now(),
        }),
      );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") {
        setDeleteError("The recipe could not be deleted.");
        return;
      }
      await navigate({
        to: "/households/$householdId/recipes",
        params: { householdId },
        replace: true,
      });
    } catch {
      setDeleteError("The recipe could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteImage(image: RecipeImage) {
    if (!mutationEnabled) return;
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
        invalidateRecipeImageUrl({
          householdId,
          recipeId,
          imageId: image.id,
          userId,
        });
      } else {
        restoreImage();
      }
    } catch {
      restoreImage();
    }
  }

  return (
    <article
      className="grid gap-2"
      aria-busy={result.type !== "complete" || deleting}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Input
          {...editor.titleProps}
          appearance="seamless"
          aria-label="Recipe title"
          className="min-w-0 flex-1 text-2xl font-semibold text-primary"
          maxLength={150}
        />
        <ConfirmationPopover
          message="Are you sure you want to delete this recipe?"
          trigger={
            <IconButton
              aria-label="Delete recipe"
              title="Delete recipe"
              className="size-7! shrink-0"
              disabled={!mutationEnabled || deleting}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          }
          onConfirm={() => void deleteRecipe()}
        />
      </div>
      {deleteError ? (
        <InlineAlert role="alert" variant="danger">
          {deleteError}
        </InlineAlert>
      ) : null}
      <Textarea
        {...editor.descriptionProps}
        appearance="seamless"
        aria-label="Recipe description"
        maxLength={5_000}
        placeholder="Add a description…"
        rows={1}
      />
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <Images aria-hidden="true" className="size-5" />
          Pictures
        </h2>
        {visibleImages.length > 0 ? (
          <div className="pt-1">
            <RecipeImageGallery
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipeId}
              images={visibleImages}
              onSessionExpired={onSessionExpired}
              onOpen={openGalleryImage}
              onReorder={reorderImages}
              userId={userId}
            />
          </div>
        ) : null}
        <RecipeImageUploadForm
          accessToken={accessToken}
          appearance="row"
          householdId={householdId}
          recipeId={recipeId}
          position={nextImagePosition}
          onSessionExpired={onSessionExpired}
        />
      </section>
      <ErrorPopover {...editor.errorPopoverProps}>{editor.error}</ErrorPopover>

      <section>
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <CookingPot aria-hidden="true" className="size-5" />
          Ingredients
        </h2>
        <div className="pt-1 pb-4">
          <RecipeIngredientList
            householdId={householdId}
            recipeId={recipeId}
            ingredients={recipe.ingredients}
          />
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <History aria-hidden="true" className="size-5" />
          Cooking history
        </h2>
        <div className="min-w-0 pt-1 pb-4">
          <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
          {recipe.cookLogs.length > 0 && (
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
              userId={userId}
            />
          )}
        </div>
      </section>

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
        userId={userId}
      />
    </article>
  );
}
