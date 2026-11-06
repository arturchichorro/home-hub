import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useDebouncedTextEditor } from "../editing/use-debounced-text-editor";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function DocumentText({
  householdId,
  documentId,
  field,
  value,
  onWork,
  focus = false,
}: {
  householdId: string;
  documentId: string;
  field: "title" | "description";
  value: string;
  onWork: (key: string, busy: boolean) => void;
  focus?: boolean;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const ref = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: value,
    required: field === "title",
    emptyError: "A document title is required.",
    failureError: "The change could not be saved.",
    mutationEnabled: enabled,
    preserveOnFailure: true,

    normalize: (v) => v.trim(),

    save: async (value) =>
      (
        await acknowledgeMutation(
          zero.mutate(
            mutators.documents.update({
              householdId,
              documentId,
              field,
              value,
              optimisticTimestamp: Date.now(),
            }),
          ),
        )
      ).type === "success",
  });

  useEffect(() => {
    onWork(`${documentId}:${field}`, editor.hasChanges || editor.isSaving);

    return () => onWork(`${documentId}:${field}`, false);
  }, [documentId, field, editor.hasChanges, editor.isSaving, onWork]);

  useEffect(() => {
    if (focus) {
      ref.current?.focus();
    }
  }, [focus]);

  return (
    <>
      <Input
        ref={ref}
        appearance="seamless"
        aria-label={
          field === "title" ? "Document title" : "Document description"
        }
        aria-busy={editor.isSaving || undefined}
        aria-invalid={!!editor.error}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className={`h-7! min-w-0 py-1 text-sm ${field === "description" ? "text-muted" : "font-medium"}`}
        disabled={!enabled}
        maxLength={field === "title" ? 200 : 1000}
        placeholder={field === "description" ? "Description" : "Document title"}
        value={editor.value}
        onChange={(e) => editor.changeValue(e.target.value)}
        onBlur={editor.handleBlur}
        onKeyDown={(e) => editor.handleKeyDown(e, true)}
      />
      {editor.hasChanges ? <TextDraftGuard editor={editor} /> : null}
      <ErrorPopover
        anchor={ref}
        id={editor.errorId}
        open={!!editor.error}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={editor} />
      </ErrorPopover>
    </>
  );
}
