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

type CookLogGroup = {
  date: Date;
  logs: [RecipeCookLog, ...RecipeCookLog[]];
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function groupCookLogsByDay(
  cookLogs: readonly RecipeCookLog[],
): CookLogGroup[] {
  const groups = new Map<string, CookLogGroup>();

  for (const cookLog of cookLogs) {
    const date = new Date(cookLog.cookedAt);
    const key = localDateKey(date);
    const group = groups.get(key);

    if (group) {
      group.logs.push(cookLog);
    } else {
      groups.set(key, { date, logs: [cookLog] });
    }
  }

  return [...groups.values()];
}

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
  const groups = groupCookLogsByDay(cookLogs);

  function deleteCookLog(cookLogId: string) {
    if (!mutationEnabled) return;
    zero.mutate(
      mutators.recipes.deleteCookLog({ householdId, recipeId, cookLogId }),
    );
  }

  return (
    <ul className="list-disc pl-5">
      {groups.map(({ date, logs }) => {
        const cookLogIds = logs.map((cookLog) => cookLog.id);
        const cookLogIdSet = new Set(cookLogIds);
        const groupImages = images.filter(
          (image) =>
            image.cookLogId !== null && cookLogIdSet.has(image.cookLogId),
        );
        const editingCommentLog = logs.find(
          (cookLog) => cookLog.id === editingCommentCookLogId,
        );
        const displayedCommentLog =
          editingCommentLog ?? logs.find((cookLog) => cookLog.comment !== null);
        const actionTargetLog = displayedCommentLog ?? logs[0];
        const dateLabel = dateFormatter.format(date);
        const hasCommentEditor = displayedCommentLog !== undefined;
        const cookedLabel =
          logs.length > 1 ? `Cooked ${logs.length}x on` : "Cooked on";

        const commentInput = displayedCommentLog ? (
          <RecipeCookLogCommentInput
            cookLogId={displayedCommentLog.id}
            currentComment={displayedCommentLog.comment}
            focusOnMount={
              displayedCommentLog.id === editingCommentCookLogId &&
              displayedCommentLog.comment === null
            }
            householdId={householdId}
            recipeId={recipeId}
            onBlur={() => setEditingCommentCookLogId(undefined)}
            onFocus={() => setEditingCommentCookLogId(displayedCommentLog.id)}
          />
        ) : null;

        const actions = (
          <div className="flex shrink-0 items-center gap-1">
            {!hasCommentEditor ? (
              <IconButton
                type="button"
                aria-label={`Add comment to cooking log from ${dateLabel}`}
                className="size-7!"
                disabled={!mutationEnabled}
                onClick={() => setEditingCommentCookLogId(actionTargetLog.id)}
              >
                <MessageSquare aria-hidden="true" className="size-4" />
              </IconButton>
            ) : null}
            <RecipeImageUploadForm
              accessToken={accessToken}
              appearance="subtle"
              cookLogId={actionTargetLog.id}
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
              onConfirm={() => deleteCookLog(actionTargetLog.id)}
            />
          </div>
        );

        return (
          <li key={localDateKey(date)} className="py-1 text-sm">
            {groupImages.length === 0 ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center">
                  <span className="shrink-0 font-medium">
                    {cookedLabel}{" "}
                    <time dateTime={date.toISOString()}>{dateLabel}</time>
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
                    {cookedLabel}{" "}
                    <time dateTime={date.toISOString()}>{dateLabel}</time>:
                  </span>
                  <div className="min-w-0">
                    <ul className="flex min-w-0 gap-2 overflow-x-auto">
                      {groupImages.map((image) => (
                        <RecipeImageThumbnail
                          key={image.id}
                          accessToken={accessToken}
                          householdId={householdId}
                          recipeId={recipeId}
                          image={image}
                          className="size-12 shrink-0"
                          onSessionExpired={onSessionExpired}
                          onOpen={(image) => onOpenImage(image, cookLogIds)}
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
  );
}
