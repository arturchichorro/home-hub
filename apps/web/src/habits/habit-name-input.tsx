import { cleanHabitName } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useHabitDraftStatus } from "./use-habit-draft-status";

export function HabitNameInput({
  currentName,
  householdId,
  habitId,
  disabled = false,
  compact = false,
  onDirtyChange,
}: {
  currentName: string;
  householdId: string;
  habitId: string;
  disabled?: boolean;
  compact?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled() && !disabled;
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentName,
    preserveOnFailure: true,
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
  useHabitDraftStatus(editor.hasChanges || editor.isSaving, onDirtyChange);
  return (
    <>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Habit name"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className={
          compact
            ? "min-w-0 w-full flex-1! text-sm font-medium"
            : "field-sizing-content min-w-0 max-w-1/2 flex-initial! text-lg font-medium text-primary"
        }
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
