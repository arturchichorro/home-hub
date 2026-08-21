import { cleanRecipeIngredientName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  ErrorPopover,
  InlineAlert,
  Input,
  Plus,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const autosaveDelayMs = 600;

type RecipeIngredientDraftNameFormProps = {
  focusRequest: number;
  householdId: string;
  ingredientId: string;
  onCancel: () => void;
  onServerError: (message: string) => void;
  position: number;
  recipeId: string;
};

export function RecipeIngredientDraftNameForm({
  focusRequest,
  householdId,
  ingredientId,
  onCancel,
  onServerError,
  position,
  recipeId,
}: RecipeIngredientDraftNameFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savingRef = useRef(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (focusRequest >= 0) inputRef.current?.focus();
  }, [focusRequest]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  function clearScheduledSave() {
    if (timeoutRef.current === undefined) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }

  async function saveDraft(rawName: string, dismissEmpty: boolean) {
    clearScheduledSave();
    if (savingRef.current) return;

    const submittedName = cleanRecipeIngredientName(rawName);
    if (submittedName.length === 0) {
      if (dismissEmpty) onCancel();
      return;
    }
    if (!mutationEnabled) {
      setError("Unable to add the ingredient.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    const mutation = zero.mutate(
      mutators.recipes.addIngredient({
        ingredientId,
        householdId,
        recipeId,
        name: submittedName,
        position,
        optimisticTimestamp: Date.now(),
      }),
    );
    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to add the ingredient.");
      savingRef.current = false;
      setSaving(false);
      return;
    }

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      onServerError("The ingredient could not be saved.");
    }
  }

  function changeName(value: string) {
    setName(value);
    setError(undefined);
    clearScheduledSave();
    if (cleanRecipeIngredientName(value).length === 0) return;
    timeoutRef.current = setTimeout(() => {
      void saveDraft(value, false);
    }, autosaveDelayMs);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveDraft(name, true);
  }

  const errorId = `ingredient-${ingredientId}-error`;

  return (
    <form className="min-w-0" onSubmit={handleSubmit}>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Ingredient name"
        aria-busy={saving || undefined}
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? errorId : undefined}
        autoComplete="off"
        className="field-sizing-content h-7! min-w-0 flex-initial! px-1 leading-7"
        disabled={!mutationEnabled}
        enterKeyHint="done"
        maxLength={150}
        placeholder="Ingredient name"
        value={name}
        onBlur={() => void saveDraft(name, true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          clearScheduledSave();
          onCancel();
        }}
        onValueChange={changeName}
      />
      <ErrorPopover
        anchor={inputRef}
        id={errorId}
        open={error !== undefined}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
    </form>
  );
}

type AddRecipeIngredientTriggerRowProps = {
  draftActive: boolean;
  error?: string | undefined;
  onActivate: () => void;
};

export function AddRecipeIngredientTriggerRow({
  draftActive,
  error,
  onActivate,
}: AddRecipeIngredientTriggerRowProps) {
  const mutationEnabled = useZeroMutationEnabled();

  return (
    <li>
      <div className="p-2">
        <Button
          type="button"
          variant="ghost"
          disabled={!mutationEnabled}
          className="h-7! px-1! font-normal text-muted"
          onClick={onActivate}
          onPointerDown={(event) => {
            if (draftActive) event.preventDefault();
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add ingredient
        </Button>
      </div>
      {error ? (
        <InlineAlert className="m-2 mt-0" role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </li>
  );
}
