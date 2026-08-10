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

type CreateRecipeFormProps = {
  householdId: string;
  onCancel: () => void;
  onCreated: (recipeId: string) => void;
};

export function CreateRecipeForm({
  householdId,
  onCancel,
  onCreated,
}: CreateRecipeFormProps) {
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
    const recipeId = crypto.randomUUID();
    const mutation = zero.mutate(
      mutators.recipes.create({
        recipeId,
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
    onCreated(recipeId);

    const serverResult = await mutation.server;

    if (serverResult.type === "error") {
      setError("The recipe could not be saved.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <Field label="Title">
        <FieldControl
          name="title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="Description">
        <FieldTextarea
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!mutationEnabled}>
          Create recipe
        </Button>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </form>
  );
}
