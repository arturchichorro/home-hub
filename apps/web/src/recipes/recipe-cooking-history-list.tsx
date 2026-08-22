import { mutators } from "@home-hub/shared/zero/mutators";
import type { RecipeCookLog, RecipeImage } from "@home-hub/shared/zero/schema";
import {
  ConfirmationPopover,
  IconButton,
  MessageSquare,
  Trash2,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { RecipeCookLogCommentInput } from "./recipe-cook-log-comment-input";
import { RecipeImageThumbnail } from "./recipe-image-gallery";
import { RecipeImageUploadForm } from "./recipe-image-upload-form";

type RecipeCookingHistoryListProps = {
  accessToken: string;
  cookLogs: readonly RecipeCookLog[];
  householdId: string;
  images: readonly RecipeImage[];
  nextImagePosition: number;
  recipeId: string;
  onOpenImage: (image: RecipeImage, cookLogIds: readonly string[]) => void;
  onSessionExpired: () => void;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function RecipeCookingHistoryList({
  accessToken,
  cookLogs,
  householdId,
  images,
  nextImagePosition,
  recipeId,
  onOpenImage,
  onSessionExpired,
}: RecipeCookingHistoryListProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [editingCommentCookLogId, setEditingCommentCookLogId] =
    useState<string>();

  function deleteCookLog(cookLogId: string) {
    if (!mutationEnabled) return;
    zero.mutate(
      mutators.recipes.deleteCookLog({ householdId, recipeId, cookLogId }),
    );
  }

  return (
    <ul className="list-disc pl-5 divide-y divide-border">
      {cookLogs.map((cookLog) => {
        const date = new Date(cookLog.cookedAt);
        const cookLogImages = images.filter(
          (image) => image.cookLogId === cookLog.id,
        );
        const dateLabel = dateFormatter.format(date);
        const editingComment = editingCommentCookLogId === cookLog.id;
        const hasCommentEditor = cookLog.comment !== null || editingComment;

        const commentInput = hasCommentEditor ? (
          <RecipeCookLogCommentInput
            cookLogId={cookLog.id}
            currentComment={cookLog.comment}
            focusOnMount={editingComment && cookLog.comment === null}
            householdId={householdId}
            recipeId={recipeId}
            onBlur={() => setEditingCommentCookLogId(undefined)}
            onFocus={() => setEditingCommentCookLogId(cookLog.id)}
          />
        ) : null;

        const actions = (
          <div className="flex shrink-0 items-center gap-2">
            {!hasCommentEditor ? (
              <IconButton
                type="button"
                aria-label={`Add comment to cooking log from ${dateLabel}`}
                className="size-7!"
                disabled={!mutationEnabled}
                onClick={() => setEditingCommentCookLogId(cookLog.id)}
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
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center">
                <span className="shrink-0 text-muted">
                  Cooked on{" "}
                  <span className="font-bold text-on-primary">
                    <time dateTime={date.toISOString()}>{dateLabel}</time>
                  </span>
                  {hasCommentEditor ? ":" : null}
                </span>
                {commentInput}
              </div>
              {actions}
            </div>
            {cookLogImages.length > 0 ? (
              <ul className="mt-1 flex min-w-0 gap-2 overflow-x-auto">
                {cookLogImages.map((image) => (
                  <RecipeImageThumbnail
                    key={image.id}
                    accessToken={accessToken}
                    householdId={householdId}
                    recipeId={recipeId}
                    image={image}
                    className="size-12 shrink-0"
                    onSessionExpired={onSessionExpired}
                    onOpen={(image) => onOpenImage(image, [cookLog.id])}
                  />
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
