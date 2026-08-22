import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  Collapsible,
  ConfirmationPopover,
  CookingPot,
  ErrorPopover,
  History,
  IconButton,
  InlineAlert,
  Input,
  MessageSquare,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { AddRecipeCookLogForm } from "./add-recipe-cook-log-form";
import { deleteRecipeImage } from "./image-api";
import { RecipeCookLogCommentInput } from "./recipe-cook-log-comment-input";
import {
  RecipeImageGallery,
  RecipeImageThumbnail,
  RecipeImageViewer,
} from "./recipe-image-gallery";
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
  const [editingCookLogCommentId, setEditingCookLogCommentId] =
    useState<string>();
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
        <div className="space-y-4">
          <AddRecipeCookLogForm householdId={householdId} recipeId={recipeId} />
          {recipe.cookLogs.length === 0 ? (
            <p className="text-sm text-muted">
              This recipe has not been cooked yet.
            </p>
          ) : (
            <ul className="list-disc pl-5">
              {recipe.cookLogs.map((cookLog) => {
                const cookedAt = new Date(cookLog.cookedAt);
                const cookedAtLabel = dateFormatter.format(cookedAt);
                const images = visibleImages.filter(
                  (image) => image.cookLogId === cookLog.id,
                );
                const editingComment = editingCookLogCommentId === cookLog.id;
                const hasCommentEditor =
                  cookLog.comment !== null || editingComment;

                const commentInput = hasCommentEditor ? (
                  <RecipeCookLogCommentInput
                    cookLogId={cookLog.id}
                    currentComment={cookLog.comment}
                    focusOnMount={editingComment && cookLog.comment === null}
                    householdId={householdId}
                    recipeId={recipeId}
                    onBlur={() => setEditingCookLogCommentId(undefined)}
                    onFocus={() => setEditingCookLogCommentId(cookLog.id)}
                  />
                ) : null;

                const actions = (
                  <div className="flex shrink-0 items-center gap-1">
                    {cookLog.comment === null && !editingComment ? (
                      <IconButton
                        type="button"
                        aria-label={`Add comment to cooking log from ${cookedAtLabel}`}
                        className="size-7!"
                        disabled={!mutationEnabled}
                        onClick={() => setEditingCookLogCommentId(cookLog.id)}
                      >
                        <MessageSquare aria-hidden="true" className="size-4" />
                      </IconButton>
                    ) : null}
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
                );

                return (
                  <li key={cookLog.id} className="py-1 text-sm">
                    {images.length === 0 ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex min-w-0 flex-1 items-center">
                          <span className="shrink-0 font-medium">
                            Cooked on{" "}
                            <time dateTime={cookedAt.toISOString()}>
                              {cookedAtLabel}
                            </time>
                            {hasCommentEditor ? ":" : null}
                          </span>
                          {commentInput}
                        </div>
                        {actions}
                      </div>
                    ) : (
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
                          <span className="pt-3 font-medium">
                            Cooked on{" "}
                            <time dateTime={cookedAt.toISOString()}>
                              {cookedAtLabel}
                            </time>
                            :
                          </span>
                          <div className="min-w-0">
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
                            {commentInput}
                          </div>
                        </div>
                        {actions}
                      </div>
                    )}
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
