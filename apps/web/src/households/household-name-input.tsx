import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useRef } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { renameHousehold } from "./api";

type HouseholdNameInputProps = {
  accessToken: string;
  currentName: string;
  householdId: string;
  onSessionExpired: () => void;
};

export function HouseholdNameInput({
  accessToken,
  currentName,
  householdId,
  onSessionExpired,
}: HouseholdNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: currentName,
    emptyError: "The household name cannot be empty.",
    failureError: "The household name could not be saved.",
    mutationEnabled: true,
    normalize: (value) => value.trim(),
    required: true,
    save: async (name) => {
      try {
        const result = await renameHousehold({
          accessToken,
          householdId,
          name,
        });

        if (result.kind === "unauthorized") {
          onSessionExpired();
        }

        return result.kind === "success";
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
        aria-label="Household name"
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        className="min-w-0 flex-1 text-2xl font-semibold text-primary"
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
