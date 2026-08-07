import { mutators } from "@home-hub/shared/zero/mutators";
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
    <form onSubmit={handleSubmit}>
      <label htmlFor="recipe-ingredient-name">Ingredient</label>
      <input
        id="recipe-ingredient-name"
        name="name"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="recipe-ingredient-quantity">Quantity</label>
      <input
        id="recipe-ingredient-quantity"
        name="quantity"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />

      <label htmlFor="recipe-ingredient-unit">Unit</label>
      <input
        id="recipe-ingredient-unit"
        name="unit"
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
      />

      <label htmlFor="recipe-ingredient-note">Note</label>
      <textarea
        id="recipe-ingredient-note"
        name="note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <button type="submit" disabled={!mutationEnabled}>
        Add ingredient
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
