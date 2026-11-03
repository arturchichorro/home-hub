import { cleanLogTitle } from "@home-hub/shared/logs";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef } from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useDebouncedTextEditor } from "../editing/use-debounced-text-editor";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
export function LogTitle({
  householdId,
  logId,
  title,
}: {
  householdId: string;
  logId: string;
  title: string;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled(),
    ref = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: title,
    required: true,
    emptyError: "A title is required.",
    failureError: "The title could not be saved. It may already exist.",
    mutationEnabled: enabled,
    preserveOnFailure: true,
    normalize: cleanLogTitle,
    save: async (title) =>
      (
        await acknowledgeMutation(
          zero.mutate(
            mutators.logs.rename({
              householdId,
              logId,
              title,
              optimisticTimestamp: Date.now(),
            }),
          ),
        )
      ).type === "success",
  });
  return (
    <>
      <Input
        ref={ref}
        appearance="seamless"
        className="h-7! min-w-0 px-0! py-1 font-medium"
        aria-label="Log title"
        maxLength={100}
        disabled={!enabled}
        value={editor.value}
        aria-invalid={!!editor.error}
        onChange={(e) => editor.changeValue(e.target.value)}
        onBlur={editor.handleBlur}
        onKeyDown={(e) => editor.handleKeyDown(e, true)}
      />
      {editor.hasChanges ? <TextDraftGuard editor={editor} /> : null}
      <ErrorPopover
        anchor={ref}
        open={!!editor.error}
        id={editor.errorId}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={editor} />
      </ErrorPopover>
    </>
  );
}
