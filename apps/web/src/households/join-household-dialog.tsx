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
import { acceptHouseholdInvite } from "./api";

type JoinHouseholdDialogProps = {
  accessToken: string;
  onJoined: (householdId: string) => void;
  onOpenChange: (open: boolean) => void;
  onSessionExpired: () => void;
  open: boolean;
};

export function JoinHouseholdDialog({
  accessToken,
  onJoined,
  onOpenChange,
  onSessionExpired,
  open,
}: JoinHouseholdDialogProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mutationEnabled = useZeroMutationEnabled();

  function changeOpen(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setToken("");
      setError(undefined);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutationEnabled) return;
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = await acceptHouseholdInvite({ accessToken, token });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "invalid_invite") {
        setError("That invite is invalid or no longer available.");
        return;
      }

      if (result.kind === "already_member") {
        setError("You already belong to that household.");
        return;
      }

      setToken("");
      onOpenChange(false);
      onJoined(result.membership.householdId);
    } catch {
      setError("Unable to join the household. Please try again.");
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
        title="Join household"
        description="Paste the invite token shared by a household owner."
        actions={
          <>
            <DialogClose disabled={isSubmitting}>Cancel</DialogClose>
            <Button
              type="submit"
              form="join-household-form"
              busy={isSubmitting}
              disabled={!mutationEnabled}
            >
              Join household
            </Button>
          </>
        }
      >
        <form
          id="join-household-form"
          className="grid gap-4"
          onSubmit={handleSubmit}
        >
          <Field label="Invite token">
            <FieldControl
              name="token"
              autoComplete="off"
              disabled={!mutationEnabled}
              required
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
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
