import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  Field,
  FieldControl,
  InlineAlert,
} from "@home-hub/ui-web";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { createHousehold } from "./api";

type CreateHouseholdDialogProps = {
  accessToken: string;
  onCreated: (householdId: string) => void;
  onOpenChange: (open: boolean) => void;
  onSessionExpired: () => void;
  open: boolean;
};

export function CreateHouseholdDialog({
  accessToken,
  onCreated,
  onOpenChange,
  onSessionExpired,
  open,
}: CreateHouseholdDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mutationEnabled = useZeroMutationEnabled();

  function changeOpen(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setName("");
      setError(undefined);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutationEnabled) return;
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = await createHousehold({ accessToken, name });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      setName("");
      onOpenChange(false);
      onCreated(result.household.id);
    } catch {
      setError("Unable to create the household. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={changeOpen}
      disablePointerDismissal={isSubmitting}
    >
      <DialogPopup
        size="medium"
        title="Create household"
        description="Create a shared space for your household modules."
        actions={
          <>
            <DialogClose disabled={isSubmitting}>Cancel</DialogClose>
            <Button
              type="submit"
              form="create-household-form"
              busy={isSubmitting}
              disabled={!mutationEnabled}
            >
              Create household
            </Button>
          </>
        }
      >
        <form
          id="create-household-form"
          className="grid gap-4"
          onSubmit={handleSubmit}
        >
          <Field label="Household name">
            <FieldControl
              name="name"
              autoComplete="off"
              disabled={!mutationEnabled}
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          {error ? (
            <InlineAlert role="alert" variant="danger">
              {error}
            </InlineAlert>
          ) : null}
        </form>
      </DialogPopup>
    </DialogRoot>
  );
}
