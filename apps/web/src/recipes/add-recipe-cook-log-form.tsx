import { mutators } from "@home-hub/shared/zero/mutators";
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
    <form onSubmit={handleSubmit}>
      <label htmlFor="recipe-cooked-at">Cooked at</label>
      <input
        id="recipe-cooked-at"
        name="cookedAt"
        type="datetime-local"
        required
        value={cookedAt}
        onChange={(event) => setCookedAt(event.target.value)}
      />

      <label htmlFor="recipe-cook-log-comment">Comment</label>
      <textarea
        id="recipe-cook-log-comment"
        name="comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />

      <button type="submit" disabled={!mutationEnabled}>
        Add cooking log
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
