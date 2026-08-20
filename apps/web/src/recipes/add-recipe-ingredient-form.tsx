import { mutators } from "@home-hub/shared/zero/mutators";
import { IconButton, InlineAlert, Input, Plus } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

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
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(undefined);
    const submittedName = name;
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
      setSaving(false);
      return;
    }

    setName((current) => (current === submittedName ? "" : current));

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      setError("The ingredient could not be saved.");
    }
    setSaving(false);
  }

  return (
    <div className="grid gap-2">
      <form
        onSubmit={handleSubmit}
        className="grid min-h-6 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-1 px-1"
      >
        <Input
          appearance="inline"
          aria-label="Ingredient name"
          autoComplete="off"
          className="placeholder:text-sm"
          maxLength={150}
          placeholder="Add an ingredient"
          required
          value={name}
          onValueChange={setName}
        />
        <IconButton
          type="submit"
          aria-label="Add ingredient"
          busy={saving}
          disabled={!mutationEnabled || saving}
          className="col-start-2 row-start-1"
        >
          <Plus aria-hidden="true" />
        </IconButton>
      </form>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </div>
  );
}
