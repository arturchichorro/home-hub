import { mutators } from "@home-hub/shared/zero/mutators";
import { IconButton, InlineAlert, Input, Plus } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useRef, useState } from "react";
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
  const [cookedAt, setCookedAt] = useState(() => ({
    value: toLocalDateValue(new Date()),
    selected: false,
  }));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(undefined);

    const submittedCookedAt = cookedAt.value;
    const submittedComment = comment;
    const cookedAtTimestamp = new Date(
      `${submittedCookedAt}T00:00:00`,
    ).getTime();
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
        comment: submittedComment,
        optimisticTimestamp: Date.now(),
      }),
    );
    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to add the cooking log.");
      setSaving(false);
      return;
    }

    setCookedAt((current) =>
      current.value === submittedCookedAt
        ? { value: toLocalDateValue(new Date()), selected: false }
        : current,
    );
    setComment((current) => (current === submittedComment ? "" : current));

    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      setError("The cooking log could not be saved.");
    }
    setSaving(false);
  }

  return (
    <div className="grid gap-2">
      <form
        onSubmit={handleSubmit}
        className="grid min-h-12 items-center gap-1 px-1 sm:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)_2.75rem]"
      >
        <div className="flex min-w-0 items-center">
          <Input
            ref={dateInputRef}
            appearance="inline"
            aria-label="Cooking date"
            className={`text-sm ${cookedAt.selected ? "" : "text-muted"}`}
            name="cookedAt"
            type="date"
            required
            value={cookedAt.value}
            onValueChange={(value) => setCookedAt({ value, selected: true })}
          />
        </div>
        <Input
          appearance="inline"
          aria-label="Cooking comment"
          className="placeholder:text-sm"
          maxLength={1_000}
          placeholder="How did it go?"
          value={comment}
          onValueChange={setComment}
        />
        <IconButton
          type="submit"
          aria-label="Add cooking log"
          busy={saving}
          disabled={!mutationEnabled || saving}
          className="justify-self-end"
        >
          <Plus aria-hidden="true" />
        </IconButton>
      </form>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </div>
  );
}
