import { cleanHabitNote } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  ErrorPopover,
  IconButton,
  StickyNote,
  Textarea,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef, useState } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useHabitDraftStatus } from "./use-habit-draft-status";

export function HabitEntryNote({
  householdId,
  habitId,
  name,
  date,
  note,
  readOnly,
  initiallyOpen = false,
  hideTrigger = false,
  onDirtyChange,
}: {
  householdId: string;
  habitId: string;
  name: string;
  date: string;
  note: string | null;
  readOnly: boolean;
  initiallyOpen?: boolean;
  hideTrigger?: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled() && !readOnly;
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: note ?? "",
    mutationEnabled: enabled,
    normalize: (value) => cleanHabitNote(value) ?? "",
    preserveOnFailure: true,
    failureError: "Unable to save note.",
    save: async (note) => {
      try {
        const r = zero.mutate(
          mutators.habits.updateEntryNote({
            householdId,
            habitId,
            entryOn: date,
            note,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            optimisticTimestamp: Date.now(),
          }),
        );
        const client = await r.client;
        return (
          (client.type === "error" ? client : await r.server).type === "success"
        );
      } catch {
        return false;
      }
    },
  });
  const dirty = editor.hasChanges || editor.isSaving;
  useHabitDraftStatus(dirty, onDirtyChange);
  return (
    <div className="grid min-w-0 gap-1" data-habit-note>
      {!hideTrigger ? (
        <IconButton
          aria-label={`${open ? "Hide" : "Show"} note for ${name} on ${date}`}
          aria-expanded={open}
          disabled={dirty}
          className={`size-11! ${note ? "text-foreground" : "text-muted"}`}
          onClick={() => {
            setOpen((value) => !value);
            if (!open) requestAnimationFrame(() => ref.current?.focus());
          }}
        >
          <StickyNote aria-hidden="true" className="size-4" />
        </IconButton>
      ) : null}
      {open ? (
        readOnly ? (
          <p className="max-w-full break-words whitespace-pre-wrap text-sm text-muted">
            {note || "No note."}
          </p>
        ) : (
          <>
            <Textarea
              ref={ref}
              appearance="seamless"
              rows={2}
              maxLength={500}
              aria-label={`Note for ${name} on ${date}`}
              aria-busy={editor.isSaving || undefined}
              aria-invalid={!!editor.error}
              aria-errormessage={editor.error ? editor.errorId : undefined}
              className="w-full min-w-0 text-sm text-muted"
              disabled={!enabled}
              value={editor.value}
              onChange={(e) => editor.changeValue(e.target.value)}
              onBlur={editor.handleBlur}
              onKeyDown={(e) => editor.handleKeyDown(e, false)}
            />
            <ErrorPopover
              anchor={ref}
              id={editor.errorId}
              open={!!editor.error}
              onDismiss={editor.dismissError}
            >
              {editor.error}
            </ErrorPopover>
          </>
        )
      ) : null}
    </div>
  );
}
