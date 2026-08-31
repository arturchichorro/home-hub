import { cleanListName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useRef } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function ListNameInput({
  currentName,
  householdId,
  listId,
}: {
  currentName: string;
  householdId: string;
  listId: string;
}) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentName,
    emptyError: "The list name cannot be empty.",
    failureError: "The list name could not be saved.",
    mutationEnabled,
    normalize: cleanListName,
    required: true,
    save: async (name) => {
      const mutation = zero.mutate(
        mutators.lists.rename({
          householdId,
          listId,
          name,
          optimisticUpdatedAt: Date.now(),
        }),
      );
      const clientResult = await mutation.client;
      const result =
        clientResult.type === "error" ? clientResult : await mutation.server;
      return result.type === "success";
    },
  });

  return (
    <>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="List name"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="min-w-0 text-xl font-semibold text-primary"
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
