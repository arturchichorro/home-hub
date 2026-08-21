import {
  cleanRecipeIngredientAmount,
  cleanRecipeIngredientNote,
} from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input, Textarea } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useDebouncedTextEditor } from "./use-debounced-text-editor";

type IngredientDetailInputProps = {
  focusOnMount: boolean;
  householdId: string;
  ingredientId: string;
  onBlur: () => void;
  onFocus: () => void;
  recipeId: string;
};

type RecipeIngredientAmountInputProps = IngredientDetailInputProps & {
  currentAmount: string | null;
};

export function RecipeIngredientAmountInput({
  currentAmount,
  focusOnMount,
  householdId,
  ingredientId,
  onBlur,
  onFocus,
  recipeId,
}: RecipeIngredientAmountInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentAmount ?? "",
    failureError: "The ingredient amount could not be saved.",
    mutationEnabled,
    normalize: (value) => cleanRecipeIngredientAmount(value) ?? "",
    save: async (amount) => {
      const mutation = zero.mutate(
        mutators.recipes.updateIngredient({
          householdId,
          recipeId,
          ingredientId,
          amount,
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
        aria-label="Ingredient amount"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        autoComplete="off"
        className="field-sizing-content h-7! max-w-32 shrink-0 flex-initial! px-1 text-xs leading-7 text-muted"
        disabled={!mutationEnabled}
        maxLength={100}
        placeholder="Amount"
        value={editor.value}
        onBlur={() => {
          editor.handleBlur();
          onBlur();
        }}
        onFocus={onFocus}
        onKeyDown={(event) => editor.handleKeyDown(event, true)}
        onValueChange={editor.changeValue}
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

type RecipeIngredientNoteInputProps = IngredientDetailInputProps & {
  currentNote: string | null;
};

export function RecipeIngredientNoteInput({
  currentNote,
  focusOnMount,
  householdId,
  ingredientId,
  onBlur,
  onFocus,
  recipeId,
}: RecipeIngredientNoteInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentNote ?? "",
    failureError: "The ingredient note could not be saved.",
    mutationEnabled,
    normalize: (value) => cleanRecipeIngredientNote(value) ?? "",
    save: async (note) => {
      const mutation = zero.mutate(
        mutators.recipes.updateIngredient({
          householdId,
          recipeId,
          ingredientId,
          note,
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
    if (focusOnMount) textareaRef.current?.focus();
  }, [focusOnMount]);

  return (
    <>
      <Textarea
        ref={textareaRef}
        appearance="seamless"
        aria-label="Ingredient note"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="field-sizing-fixed! h-7! min-h-7! min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-0! text-xs leading-7 text-muted whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        disabled={!mutationEnabled}
        maxLength={500}
        placeholder="Note"
        rows={1}
        value={editor.value}
        onBlur={() => {
          editor.handleBlur();
          onBlur();
        }}
        onChange={(event) => editor.changeValue(event.target.value)}
        onFocus={onFocus}
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
