import { cleanHabitNote } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  ErrorPopover,
  IconButton,
  StickyNote,
  Textarea,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type Props = {
  householdId: string;
  habitId: string;
  habitName: string;
  currentNote: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  entryOn?: string;
};
export function HabitNoteInput({
  householdId,
  habitId,
  habitName,
  currentNote,
  entryOn,
  disabled = false,
  readOnly = false,
}: Props) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled() && !disabled && !readOnly;
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentNote ?? "",
    mutationEnabled: enabled,
    normalize: (value) => cleanHabitNote(value) ?? "",
    failureError: "Unable to save note.",
    save: async (note) => {
      try {
        const scope = {
          householdId,
          habitId,
          note,
          optimisticTimestamp: Date.now(),
        };
        const mutation = entryOn
          ? zero.mutate(
              mutators.habits.updateEntryNote({
                ...scope,
                entryOn,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            )
          : zero.mutate(mutators.habits.updateNote(scope));
        const client = await mutation.client;
        const outcome =
          client.type === "error" ? client : await mutation.server;
        return outcome.type === "success";
      } catch {
        return false;
      }
    },
  });
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (readOnly)
    return currentNote ? (
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted"
        title={currentNote}
      >
        {currentNote}
      </span>
    ) : null;
  return (
    <>
      {currentNote !== null ||
      editing ||
      editor.value !== "" ||
      editor.error !== undefined ? (
        <Textarea
          ref={inputRef}
          appearance="seamless"
          aria-label={`Note for ${habitName}${entryOn ? ` on ${entryOn}` : ""}`}
          aria-busy={editor.isSaving || undefined}
          aria-invalid={editor.error ? true : undefined}
          aria-errormessage={editor.error ? editor.errorId : undefined}
          className="field-sizing-fixed! h-7! min-h-7! w-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-0! text-xs leading-7 text-muted whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          disabled={!enabled}
          maxLength={500}
          rows={1}
          value={editor.value}
          onBlur={() => {
            editor.handleBlur();
            setEditing(false);
          }}
          onFocus={() => setEditing(true)}
          onChange={(event) => editor.changeValue(event.target.value)}
          onKeyDown={(event) => editor.handleKeyDown(event, false)}
        />
      ) : (
        <IconButton
          aria-label={`Add note to ${habitName}${entryOn ? ` on ${entryOn}` : ""}`}
          className="size-7!"
          disabled={!enabled}
          onClick={() => setEditing(true)}
        >
          <StickyNote aria-hidden="true" className="size-4" />
        </IconButton>
      )}
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
