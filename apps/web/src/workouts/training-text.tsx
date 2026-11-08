import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useRef } from "react";
import { TextDraftActions } from "../editing/text-draft-actions";
import { useDebouncedTextEditor } from "../editing/use-debounced-text-editor";

export function useTrainingText(options: {
  currentValue: string;
  enabled: boolean;
  ready: () => boolean;
  save: (value: string) => Promise<boolean>;
}) {
  const attempted = useRef(false);
  const editor = useDebouncedTextEditor({
    currentValue: options.currentValue,
    mutationEnabled: options.enabled,
    preserveOnFailure: true,
    normalize: (value) => value.trim(),
    failureError:
      "Unable to save this session detail. Your text is still here.",
    save: async (value) => {
      // Before the first complete set this is a local draft, not an empty log.
      // Keep the hook dirty, but only display errors from real save attempts.
      if (!options.ready()) {
        return false;
      }
      attempted.current = true;
      return options.save(value);
    },
  });
  return { ...editor, error: attempted.current ? editor.error : undefined };
}
export function TrainingText({
  editor,
  label,
  placeholder,
  maxLength = 150,
  disabled = false,
  className,
}: {
  editor: ReturnType<typeof useTrainingText>;
  label: string;
  placeholder: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Input
        ref={input}
        appearance="seamless"
        aria-label={label}
        placeholder={placeholder}
        value={editor.value}
        disabled={disabled}
        maxLength={maxLength}
        className={className ?? ""}
        aria-busy={editor.isSaving || undefined}
        aria-invalid={editor.error ? true : undefined}
        aria-errormessage={editor.error ? editor.errorId : undefined}
        onValueChange={editor.changeValue}
        onBlur={editor.handleBlur}
        onKeyDown={(event) => editor.handleKeyDown(event, true)}
      />
      <ErrorPopover
        anchor={input}
        id={editor.errorId}
        open={Boolean(editor.error)}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={editor} />
      </ErrorPopover>
    </>
  );
}
