import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Textarea } from "@home-hub/ui-web";
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
}: {
  householdId: string;
  workoutId: string;
  logId: string;
  note: string;
  focusOnMount?: boolean;
  disabled?: boolean;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const input = useRef<HTMLTextAreaElement>(null);
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
      <Textarea
        ref={input}
        appearance="seamless"
        aria-label="Log note"
        placeholder="Note…"
        rows={1}
        maxLength={1000000}
        className="text-sm text-muted"
        disabled={!enabled || disabled}
        value={editor.value}
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        onChange={(event) => editor.changeValue(event.target.value)}
        onBlur={editor.handleBlur}
        onKeyDown={(event) => editor.handleKeyDown(event, false)}
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
