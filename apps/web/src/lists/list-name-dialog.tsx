import { listNameAlreadyExistsError } from "@home-hub/shared/lists";
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
import { type SubmitEvent, useId, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type Props = {
  householdId: string;
  onClose: () => void;
  onSaved: (listId: string) => void;
};

// Mounted only while open, so each new dialog starts with fresh input/error state.
export function ListNameDialog({ householdId, onClose, onSaved }: Props) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const formId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !enabled) return;
    setSaving(true);
    setError(undefined);
    const listId = crypto.randomUUID();
    try {
      const mutation = zero.mutate(
        mutators.lists.create({
          householdId,
          listId,
          name,
          optimisticTimestamp: Date.now(),
        }),
      );
      const client = await mutation.client;
      const result = client.type === "error" ? client : await mutation.server;
      if (result.type === "error") {
        setError(
          result.error.message === listNameAlreadyExistsError
            ? "A list with this name already exists."
            : "The list could not be saved.",
        );
        return;
      }
      onSaved(listId);
      onClose();
    } catch {
      setError("The list could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      disablePointerDismissal={saving}
    >
      <DialogPopup
        title="New list"
        actions={
          <>
            <DialogClose disabled={saving}>Cancel</DialogClose>
            <Button
              type="submit"
              form={formId}
              busy={saving}
              disabled={!enabled}
            >
              Create list
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit}>
          <Field label="Name">
            <FieldControl
              autoFocus
              autoComplete="off"
              maxLength={100}
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
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
