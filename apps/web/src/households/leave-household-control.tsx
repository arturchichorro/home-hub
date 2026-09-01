import {
  ConfirmationPopover,
  ErrorPopover,
  IconButton,
  LogOut,
  Tooltip,
} from "@home-hub/ui-web";
import { useId, useRef, useState } from "react";
import { leaveHousehold } from "./api";

type LeaveHouseholdControlProps = {
  accessToken: string;
  householdId: string;
  isOwner: boolean;
  onLeftHousehold: () => void;
  onSessionExpired: () => void;
};

export function LeaveHouseholdControl({
  accessToken,
  householdId,
  isOwner,
  onLeftHousehold,
  onSessionExpired,
}: LeaveHouseholdControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function handleLeave() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await leaveHousehold({ accessToken, householdId });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setError("You are no longer a member of this household.");
        return;
      }

      if (result.kind === "owner_must_transfer") {
        setError("Transfer ownership before leaving this household.");
        return;
      }

      onLeftHousehold();
    } catch {
      setError("Unable to leave the household.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Tooltip
        content="Transfer ownership before leaving this household."
        disabled={!isOwner}
        trigger={
          <span className="inline-flex" tabIndex={isOwner ? 0 : undefined}>
            <ConfirmationPopover
              confirmLabel="Leave"
              message="Are you sure you want to leave this household?"
              trigger={
                <IconButton
                  ref={buttonRef}
                  aria-label="Leave household"
                  aria-errormessage={error ? errorId : undefined}
                  aria-invalid={error ? true : undefined}
                  busy={submitting}
                  className="size-7!"
                  disabled={isOwner}
                >
                  <LogOut aria-hidden="true" className="size-4" />
                </IconButton>
              }
              onConfirm={() => void handleLeave()}
            />
          </span>
        }
      />
      <ErrorPopover
        anchor={buttonRef}
        id={errorId}
        open={error !== null}
        onDismiss={() => setError(null)}
      >
        {error}
      </ErrorPopover>
    </>
  );
}
