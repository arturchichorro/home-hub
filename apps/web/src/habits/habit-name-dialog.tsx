import { habitNameSchema } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  Field,
  FieldControl,
  InlineAlert,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useId, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function HabitNameDialog({
  householdId,
  onClose,
}: {
  householdId: string;
  onClose: () => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const formId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || saving) return;
    const parsed = habitNameSchema.safeParse(name);
    if (!parsed.success) {
      setError("Enter a name of 1–100 characters.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const scope = {
        householdId,
        habitId: crypto.randomUUID(),
        name: parsed.data,
        optimisticTimestamp: Date.now(),
      };
      const mutation = zero.mutate(
        mutators.habits.create({
          ...scope,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
      const client = await mutation.client;
      const result = client.type === "error" ? client : await mutation.server;
      if (result.type === "error") {
        setError("The habit could not be saved.");
        return;
      }
      onClose();
    } catch {
      setError("The habit could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      disablePointerDismissal={saving}
    >
      <DialogPopup
        title="New habit"
        actions={
          <>
            <DialogClose disabled={saving}>Cancel</DialogClose>
            <Button
              type="submit"
              form={formId}
              busy={saving}
              disabled={!enabled}
            >
              Add habit
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit}>
          <Field label="Habit name" error={error}>
            <FieldControl
              autoFocus
              autoComplete="off"
              maxLength={100}
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          {error ? (
            <InlineAlert role="alert" variant="danger" className="mt-3">
              {error}
            </InlineAlert>
          ) : null}
        </form>
      </DialogPopup>
    </DialogRoot>
  );
}
