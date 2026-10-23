import { cleanHabitName } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function HabitNameInput({
  currentName,
  householdId,
  habitId,
  disabled = false,
}: {
  currentName: string;
  householdId: string;
  habitId: string;
  disabled?: boolean;
}) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled() && !disabled;
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentName,
    emptyError: "The habit name cannot be empty.",
    failureError: "The habit name could not be saved.",
    mutationEnabled,
    normalize: cleanHabitName,
    required: true,
    save: async (name) => {
      try {
        const mutation = zero.mutate(
          mutators.habits.rename({
            householdId,
            habitId,
            name,
            optimisticTimestamp: Date.now(),
          }),
        );
        const client = await mutation.client;
        const result = client.type === "error" ? client : await mutation.server;
        return result.type === "success";
      } catch {
        return false;
      }
    },
  });
  return (
    <>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Habit name"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="field-sizing-content min-w-0 max-w-1/2 flex-initial! text-lg font-medium text-primary"
        disabled={!mutationEnabled}
        maxLength={100}
        value={editor.value}
        onBlur={editor.handleBlur}
        onKeyDown={(event) => editor.handleKeyDown(event, true)}
        onValueChange={editor.changeValue}
      />
      <ErrorPopover
        anchor={inputRef}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </>
  );
}
