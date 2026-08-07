import { type SubmitEvent, useState } from "react";
import { renameHousehold } from "./api";

type RenameHouseholdFormProps = {
  accessToken: string;
  householdId: string;
  currentName: string;
  onSessionExpired: () => void;
};

export function RenameHouseholdForm({
  accessToken,
  householdId,
  currentName,
  onSessionExpired,
}: RenameHouseholdFormProps) {
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSuccess(false);

    if (name.trim().length === 0) {
      setError("Enter a household name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await renameHousehold({
        accessToken,
        householdId,
        name,
      });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setError("You are no longer allowed to rename this household.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("The household could not be renamed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="household-name">Household name</label>
      <input
        id="household-name"
        name="name"
        required
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Renaming…" : "Rename household"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {success ? <p>Household renamed.</p> : null}
    </form>
  );
}
