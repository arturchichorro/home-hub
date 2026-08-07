import { mutators } from "@home-hub/shared/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type AddShoppingItemFormProps = {
  householdId: string;
};

export function AddShoppingItemForm({ householdId }: AddShoppingItemFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const submittedName = name;
    const mutation = zero.mutate(
      mutators.shopping.add({
        itemId: crypto.randomUUID(),
        householdId,
        name: submittedName,
        optimisticTimestamp: Date.now(),
      }),
    );

    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to add the shopping item.");
      return;
    }

    setName((currentName) =>
      currentName === submittedName ? "" : currentName,
    );

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The shopping item could not be saved.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="shopping-item-name">Item</label>
      <input
        id="shopping-item-name"
        name="name"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={!mutationEnabled}>
        Add item
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
