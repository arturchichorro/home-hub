import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, IconButton, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useId, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type AddShoppingItemFormProps = {
  householdId: string;
};

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function AddShoppingItemForm({ householdId }: AddShoppingItemFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const errorId = useId();

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
    <>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-14 items-center gap-2 py-2"
      >
        <Input
          ref={inputRef}
          appearance="inline"
          aria-label="Add shopping item"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? errorId : undefined}
          autoComplete="off"
          disabled={!mutationEnabled}
          maxLength={100}
          name="name"
          placeholder="Add item"
          required
          value={name}
          onValueChange={(nextName) => {
            setName(nextName);
            setError(undefined);
          }}
        />
        <IconButton
          aria-label="Add shopping item"
          title="Add shopping item"
          type="submit"
          disabled={!mutationEnabled || name.trim().length === 0}
        >
          <PlusIcon />
        </IconButton>
      </form>
      <ErrorPopover
        anchor={inputRef}
        id={errorId}
        open={error !== undefined}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
    </>
  );
}
