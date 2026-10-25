import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function WorkoutLogNoteInput({
  householdId,
  workoutId,
  logId,
  note,
  focusOnMount = false,
  disabled = false,
  onFocus,
  onBlur,
}: {
  householdId: string;
  workoutId: string;
  logId: string;
  note: string;
  focusOnMount?: boolean;
  disabled?: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const input = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: note,
    mutationEnabled: enabled && !disabled,
    normalize: (value) => value.trim(),
    failureError: "The workout log note could not be saved.",
    save: async (note) => {
      const mutation = zero.mutate(
        mutators.workouts.updateLogNote({
          householdId,
          workoutId,
          logId,
          note,
        }),
      );
      const client = await mutation.client;
      const result = client.type === "error" ? client : await mutation.server;
      return result.type === "success";
    },
  });
  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);
  return (
    <>
      <Input
        ref={input}
        appearance="seamless"
        aria-label="Log note"
        placeholder="Note…"
        maxLength={1000000}
        className="h-7! w-full py-1 text-sm text-muted"
        disabled={!enabled || disabled}
        value={editor.value}
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        onChange={(event) => editor.changeValue(event.target.value)}
        onFocus={onFocus}
        onBlur={() => {
          editor.handleBlur();
          onBlur();
        }}
        onKeyDown={(event) => editor.handleKeyDown(event, true)}
      />
      <ErrorPopover
        anchor={input}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </>
  );
}
