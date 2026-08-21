import { cleanRecipeIngredientName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  GripVertical,
  IconButton,
  InlineAlert,
  Input,
  Plus,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const autosaveDelayMs = 600;

type AddRecipeIngredientFormProps = {
  householdId: string;
  recipeId: string;
  position: number;
};

export function AddRecipeIngredientForm({
  householdId,
  recipeId,
  position,
}: AddRecipeIngredientFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

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
      if (dismissEmpty) {
        setName("");
        setError(undefined);
        setCreating(false);
      }
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
        ingredientId: crypto.randomUUID(),
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

    setName("");
    setCreating(false);

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      setError("The ingredient could not be saved.");
    }
    savingRef.current = false;
    setSaving(false);
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

  function cancelDraft() {
    clearScheduledSave();
    setName("");
    setError(undefined);
    setCreating(false);
  }

  return (
    <>
      {creating ? (
        <li>
          <form className="flex items-center gap-1 p-2" onSubmit={handleSubmit}>
            <IconButton
              aria-label="Reordering is available after the ingredient is saved"
              className="size-7! cursor-default"
              disabled
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </IconButton>
            <Input
              ref={inputRef}
              appearance="seamless"
              aria-label="Ingredient name"
              aria-busy={saving || undefined}
              autoComplete="off"
              className="field-sizing-content h-7! min-w-0 flex-initial! px-1 leading-7"
              disabled={!mutationEnabled || saving}
              enterKeyHint="done"
              maxLength={150}
              placeholder="Ingredient name"
              value={name}
              onBlur={() => void saveDraft(name, true)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cancelDraft();
              }}
              onValueChange={changeName}
            />
          </form>
          {error ? (
            <InlineAlert className="m-2 mt-0" role="alert" variant="danger">
              {error}
            </InlineAlert>
          ) : null}
        </li>
      ) : null}
      <li>
        <div className="p-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!mutationEnabled}
            className="h-7! px-1! font-normal text-muted"
            onClick={() => {
              if (!creating) setName("");
              setError(undefined);
              setCreating(true);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add ingredient
          </Button>
        </div>
        {!creating && error ? (
          <InlineAlert className="m-2 mt-0" role="alert" variant="danger">
            {error}
          </InlineAlert>
        ) : null}
      </li>
    </>
  );
}
