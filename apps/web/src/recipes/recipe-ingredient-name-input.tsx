import { cleanRecipeIngredientName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useDebouncedTextEditor } from "./use-debounced-text-editor";

type RecipeIngredientNameInputProps = {
  currentName: string;
  focusOnMount?: boolean;
  householdId: string;
  ingredientId: string;
  recipeId: string;
};

export function RecipeIngredientNameInput({
  currentName,
  focusOnMount = false,
  householdId,
  ingredientId,
  recipeId,
}: RecipeIngredientNameInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentName,
    emptyError: "The ingredient name cannot be empty.",
    failureError: "The ingredient name could not be saved.",
    mutationEnabled,
    normalize: cleanRecipeIngredientName,
    required: true,
    save: async (name) => {
      const mutation = zero.mutate(
        mutators.recipes.renameIngredient({
          householdId,
          recipeId,
          ingredientId,
          name,
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
        aria-label="Ingredient name"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="field-sizing-content h-7! min-w-0 flex-initial! px-1 leading-7"
        disabled={!mutationEnabled}
        maxLength={150}
        value={editor.value}
        onBlur={editor.handleBlur}
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
