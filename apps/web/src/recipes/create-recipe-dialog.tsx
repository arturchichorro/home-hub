import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  Field,
  FieldControl,
  InlineAlert,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type CreateRecipeDialogProps = {
  householdId: string;
  onCreated: (recipeId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function CreateRecipeDialog({
  householdId,
  onCreated,
  onOpenChange,
  open,
}: CreateRecipeDialogProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function changeOpen(nextOpen: boolean) {
    if (submitting) return;
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setTitle("");
      setError(undefined);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);

    const recipeId = crypto.randomUUID();
    const mutation = zero.mutate(
      mutators.recipes.create({
        recipeId,
        householdId,
        title,
        description: "",
        optimisticTimestamp: Date.now(),
      }),
    );
    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to create the recipe.");
      setSubmitting(false);
      return;
    }

    setTitle("");
    onOpenChange(false);
    onCreated(recipeId);

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      setError("The recipe could not be saved.");
    }
    setSubmitting(false);
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={changeOpen}
      disablePointerDismissal={submitting}
    >
      <DialogPopup
        title="New recipe"
        actions={
          <>
            <DialogClose disabled={submitting}>Cancel</DialogClose>
            <Button
              type="submit"
              form="create-recipe-form"
              busy={submitting}
              disabled={!mutationEnabled}
            >
              Create recipe
            </Button>
          </>
        }
      >
        <form id="create-recipe-form" onSubmit={handleSubmit}>
          <Field label="Title">
            <FieldControl
              autoComplete="off"
              autoFocus
              maxLength={150}
              name="title"
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          {error ? (
            <InlineAlert className="mt-4" role="alert" variant="danger">
              {error}
            </InlineAlert>
          ) : null}
        </form>
      </DialogPopup>
    </DialogRoot>
  );
}
