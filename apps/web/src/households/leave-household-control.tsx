import { useState } from "react";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOwner) {
    return <p>Transfer ownership before leaving this household.</p>;
  }

  async function handleLeave() {
    const confirmed = window.confirm(
      "Leave this household? You will lose access to its data.",
    );

    if (!confirmed) {
      return;
    }

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
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={submitting} onClick={handleLeave}>
        {submitting ? "Leaving…" : "Leave household"}
      </button>
    </>
  );
}
