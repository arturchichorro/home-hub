import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  Field,
  FieldControl,
  FieldTextarea,
  InlineAlert,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type AddRecipeCookLogFormProps = {
  householdId: string;
  recipeId: string;
};

function toLocalDateTimeValue(date: Date): string {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localTime.toISOString().slice(0, 16);
}

export function AddRecipeCookLogForm({
  householdId,
  recipeId,
}: AddRecipeCookLogFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [cookedAt, setCookedAt] = useState(() =>
    toLocalDateTimeValue(new Date()),
  );
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const submittedCookedAt = cookedAt;
    const submittedComment = comment;
    const cookedAtTimestamp = new Date(submittedCookedAt).getTime();

    if (!Number.isFinite(cookedAtTimestamp)) {
      setError("Choose a valid cooking date and time.");
      return;
    }

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
      return;
    }

    setCookedAt((current) =>
      current === submittedCookedAt
        ? toLocalDateTimeValue(new Date())
        : current,
    );
    setComment((current) => (current === submittedComment ? "" : current));

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The cooking log could not be saved.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <Field label="Cooked at">
        <FieldControl
          name="cookedAt"
          type="datetime-local"
          required
          value={cookedAt}
          onChange={(event) => setCookedAt(event.target.value)}
        />
      </Field>

      <Field label="Comment" description="Optional notes about this cooking.">
        <FieldTextarea
          name="comment"
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </Field>

      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={!mutationEnabled}>
          Log cooking
        </Button>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger" className="md:col-span-2">
          {error}
        </InlineAlert>
      ) : null}
    </form>
  );
}
