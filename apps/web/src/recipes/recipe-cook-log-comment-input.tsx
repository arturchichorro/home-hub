import { cleanRecipeCookLogComment } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useDebouncedTextEditor } from "./use-debounced-text-editor";

type RecipeCookLogCommentInputProps = {
  cookLogId: string;
  currentComment: string | null;
  focusOnMount: boolean;
  householdId: string;
  onBlur: () => void;
  onFocus: () => void;
  recipeId: string;
};

export function RecipeCookLogCommentInput({
  cookLogId,
  currentComment,
  focusOnMount,
  householdId,
  onBlur,
  onFocus,
  recipeId,
}: RecipeCookLogCommentInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  return (
    <>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Cooking log comment"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="h-7! w-full py-1 text-sm text-muted"
        disabled={!mutationEnabled}
        maxLength={1_000}
        placeholder="Comment"
        value={editor.value}
        onBlur={() => {
          editor.handleBlur();
          onBlur();
        }}
        onChange={(event) => editor.changeValue(event.target.value)}
        onFocus={onFocus}
        onKeyDown={(event) => editor.handleKeyDown(event, true)}
      />
      <ErrorPopover
        anchor={inputRef}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </>
  );
}
