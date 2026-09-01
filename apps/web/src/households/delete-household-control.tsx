import {
  ConfirmationPopover,
  ErrorPopover,
  IconButton,
  Trash2,
} from "@home-hub/ui-web";
import { useId, useRef, useState } from "react";
import { deleteHousehold } from "./api";

type DeleteHouseholdControlProps = {
  accessToken: string;
  householdId: string;
  onDeletedHousehold: () => void;
  onSessionExpired: () => void;
};

export function DeleteHouseholdControl({
  accessToken,
  householdId,
  onDeletedHousehold,
  onSessionExpired,
}: DeleteHouseholdControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const errorId = useId();

  async function remove() {
    setDeleting(true);
    setError(undefined);

    try {
      const result = await deleteHousehold({ accessToken, householdId });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setError("You are no longer allowed to delete this household.");
        return;
      }

      onDeletedHousehold();
    } catch {
      setError("Unable to delete the household.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ConfirmationPopover
        message="Are you sure you want to delete this household?"
        trigger={
          <IconButton
            ref={buttonRef}
            aria-label="Delete household"
            aria-errormessage={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            title="Delete household"
            className="size-7!"
            busy={deleting}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </IconButton>
        }
        onConfirm={() => void remove()}
      />
      <ErrorPopover
        anchor={buttonRef}
        id={errorId}
        open={error !== undefined}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
    </>
  );
}
