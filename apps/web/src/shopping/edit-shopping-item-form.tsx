import { mutators } from "@home-hub/shared/zero/mutators";
import { Button, Field, FieldControl, InlineAlert } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type EditShoppingItemFormProps = {
  householdId: string;
  itemId: string;
  currentName: string;
  onCancel: () => void;
  onSaved: () => void;
};

export function EditShoppingItemForm({
  householdId,
  itemId,
  currentName,
  onCancel,
  onSaved,
}: EditShoppingItemFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const mutation = zero.mutate(
      mutators.shopping.rename({
        householdId,
        itemId,
        name,
        optimisticUpdatedAt: Date.now(),
      }),
    );

    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Use a non-empty name that is not already in this list.");
      setIsSubmitting(false);
      return;
    }

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The shopping item could not be renamed.");
      setIsSubmitting(false);
      return;
    }

    onSaved();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
    >
      <Field label="Item name" disabled={isSubmitting}>
        <FieldControl
          name="name"
          required
          maxLength={100}
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
      </Field>
      <Button
        type="submit"
        size="compact"
        busy={isSubmitting}
        disabled={!mutationEnabled}
      >
        Save
      </Button>
      <Button
        type="button"
        size="compact"
        variant="secondary"
        disabled={isSubmitting}
        onClick={onCancel}
      >
        Cancel
      </Button>
      {error ? (
        <InlineAlert role="alert" variant="danger" className="sm:col-span-3">
          {error}
        </InlineAlert>
      ) : null}
    </form>
  );
}
