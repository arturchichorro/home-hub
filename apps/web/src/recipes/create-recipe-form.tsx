import { mutators } from "@home-hub/shared/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type CreateRecipeFormProps = {
  householdId: string;
};

export function CreateRecipeForm({ householdId }: CreateRecipeFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const submittedTitle = title;
    const submittedDescription = description;
    const mutation = zero.mutate(
      mutators.recipes.create({
        recipeId: crypto.randomUUID(),
        householdId,
        title: submittedTitle,
        description: submittedDescription,
        optimisticTimestamp: Date.now(),
      }),
    );

    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      setError("Unable to create the recipe.");
      return;
    }

    setTitle((currentTitle) =>
      currentTitle === submittedTitle ? "" : currentTitle,
    );
    setDescription((currentDescription) =>
      currentDescription === submittedDescription ? "" : currentDescription,
    );

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The recipe could not be saved.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="recipe-title">Title</label>
      <input
        id="recipe-title"
        name="title"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="recipe-description">Description</label>
      <textarea
        id="recipe-description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <button type="submit" disabled={!mutationEnabled}>
        Create recipe
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
