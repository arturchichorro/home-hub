import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useDebouncedTextEditor } from "../editing/use-debounced-text-editor";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function WorkoutLogNoteInput({
  householdId,
  logId,
  note,
  focusOnMount = false,
  disabled = false,
  onFocus,
  onBlur,
  onDirtyChange,
}: {
  householdId: string;
  logId: string;
  note: string;
  focusOnMount?: boolean;
  disabled?: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [record, result] = useQuery(
    queries.training.note({ householdId, logId }),
  );
  const writable =
    enabled && !disabled && result.type === "complete" && Boolean(record);
  const input = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    preserveOnFailure: true,
    currentValue: record?.note ?? note,
    mutationEnabled: writable,

    normalize: (value) => value.trim(),

    failureError: "The workout log note could not be saved.",

    save: async (note) => {
      const mutation = zero.mutate(
        mutators.training.update({ householdId, logId, changes: { note } }),
      );
      const result = await acknowledgeMutation(mutation);

      return result.type === "success";
    },
  });

  useLayoutEffect(() => {
    onDirtyChange?.(editor.hasChanges);

    return () => onDirtyChange?.(false);
  }, [editor.hasChanges, onDirtyChange]);

  useEffect(() => {
    if (focusOnMount && writable) {
      input.current?.focus();
    }
  }, [focusOnMount, writable]);

  return (
    <>
      <Input
        ref={input}
        appearance="seamless"
        aria-label="Log note"
        placeholder="Note…"
        maxLength={1000000}
        className="h-7! w-full py-1 text-sm text-muted"
        disabled={!writable}
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
      {editor.hasChanges && <TextDraftGuard editor={editor} />}
      <ErrorPopover
        anchor={input}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={editor} />
      </ErrorPopover>
    </>
  );
}
