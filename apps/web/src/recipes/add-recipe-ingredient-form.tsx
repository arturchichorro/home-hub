import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  Field,
  FieldControl,
  FieldTextarea,
  InlineAlert,
} from "@home-hub/ui-web";
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
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const submitted = { name, quantity, unit, note };
    const mutation = zero.mutate(
      mutators.recipes.addIngredient({
        ingredientId: crypto.randomUUID(),
        householdId,
        recipeId,
        ...submitted,
        position,
        optimisticTimestamp: Date.now(),
      }),
    );

    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to add the ingredient.");
      return;
    }

    setName((current) => (current === submitted.name ? "" : current));
    setQuantity((current) => (current === submitted.quantity ? "" : current));
    setUnit((current) => (current === submitted.unit ? "" : current));
    setNote((current) => (current === submitted.note ? "" : current));

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The ingredient could not be saved.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem]"
    >
      <Field label="Ingredient">
        <FieldControl
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Quantity">
        <FieldControl
          name="quantity"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </Field>

      <Field label="Unit">
        <FieldControl
          name="unit"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
        />
      </Field>

      <Field label="Note" className="md:col-span-3">
        <FieldTextarea
          name="note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <div className="flex justify-end md:col-span-3">
        <Button type="submit" disabled={!mutationEnabled}>
          Add ingredient
        </Button>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger" className="md:col-span-3">
          {error}
        </InlineAlert>
      ) : null}
    </form>
  );
}
