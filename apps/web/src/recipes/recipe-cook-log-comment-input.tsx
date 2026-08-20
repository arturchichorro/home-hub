import { cleanRecipeCookLogComment } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Textarea } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useDebouncedTextEditor } from "./use-debounced-text-editor";

type RecipeCookLogCommentInputProps = {
  cookLogId: string;
  currentComment: string | null;
  householdId: string;
  recipeId: string;
};

export function RecipeCookLogCommentInput({
  cookLogId,
  currentComment,
  householdId,
  recipeId,
}: RecipeCookLogCommentInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentComment ?? "",
    failureError: "The cooking log comment could not be saved.",
    mutationEnabled,
    normalize: (value) => cleanRecipeCookLogComment(value) ?? "",
    save: async (comment) => {
      const mutation = zero.mutate(
        mutators.recipes.updateCookLog({
          cookLogId,
          householdId,
          recipeId,
          comment,
          optimisticUpdatedAt: Date.now(),
        }),
      );
      const clientResult = await mutation.client;
      const result =
        clientResult.type === "error" ? clientResult : await mutation.server;
      return result.type === "success";
    },
  });

  return (
    <>
      <Textarea
        ref={textareaRef}
        appearance="seamless"
        aria-label="Cooking log comment"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="min-h-7! py-1 text-sm text-muted"
        disabled={!mutationEnabled}
        maxLength={1_000}
        placeholder="No comment"
        rows={1}
        value={editor.value}
        onBlur={editor.handleBlur}
        onChange={(event) => editor.changeValue(event.target.value)}
        onKeyDown={(event) => editor.handleKeyDown(event, false)}
      />
      <ErrorPopover
        anchor={textareaRef}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </>
  );
}
