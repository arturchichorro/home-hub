import { Button, Field, FieldControl, InlineAlert } from "@home-hub/ui-web";
import { type SubmitEvent, useEffect, useState } from "react";
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

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

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
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <Field label="Household name">
        <FieldControl
          name="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSuccess(false);
          }}
        />
      </Field>
      <Button type="submit" busy={isSubmitting}>
        Rename household
      </Button>
      {error ? (
        <InlineAlert role="alert" variant="danger" className="sm:col-span-2">
          {error}
        </InlineAlert>
      ) : null}
      {success ? (
        <InlineAlert role="status" variant="success" className="sm:col-span-2">
          Household renamed.
        </InlineAlert>
      ) : null}
    </form>
  );
}
