import { mutators } from "@home-hub/shared/zero/mutators";
import { Button, InlineAlert, Plus } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type ChangeEvent, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type AddRecipeCookLogFormProps = {
  householdId: string;
  recipeId: string;
};

function toLocalDateValue(date: Date): string {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localTime.toISOString().slice(0, 10);
}

export function AddRecipeCookLogForm({
  householdId,
  recipeId,
}: AddRecipeCookLogFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const today = toLocalDateValue(new Date());

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input || saving) return;

    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

  async function addCookLog(event: ChangeEvent<HTMLInputElement>) {
    const selectedDate = event.currentTarget.value;
    event.currentTarget.value = "";
    if (!selectedDate || saving || !mutationEnabled) return;

    setError(undefined);
    if (selectedDate > today) {
      setError("Cooking date cannot be in the future.");
      return;
    }
    const cookedAtTimestamp = new Date(`${selectedDate}T00:00:00`).getTime();
    if (!Number.isFinite(cookedAtTimestamp)) {
      setError("Choose a valid cooking date.");
      return;
    }

    setSaving(true);
    const mutation = zero.mutate(
      mutators.recipes.addCookLog({
        cookLogId: crypto.randomUUID(),
        householdId,
        recipeId,
        cookedAt: cookedAtTimestamp,
        comment: null,
        optimisticTimestamp: Date.now(),
      }),
    );
    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to add the cooking log.");
      setSaving(false);
      return;
    }

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      setError("The cooking log could not be saved.");
    }
    setSaving(false);
  }

  return (
    <div>
      <input
        ref={dateInputRef}
        className="sr-only"
        type="date"
        aria-label="Cooking date"
        max={today}
        tabIndex={-1}
        onChange={(event) => void addCookLog(event)}
      />
      <div className="p-2.5">
        <Button
          type="button"
          variant="ghost"
          aria-busy={saving || undefined}
          busy={saving}
          disabled={!mutationEnabled || saving}
          className="h-7! px-1.5! ml-2 font-normal text-muted"
          onClick={openDatePicker}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add entry
        </Button>
      </div>
      {error ? (
        <InlineAlert className="m-2 mt-0" role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </div>
  );
}
