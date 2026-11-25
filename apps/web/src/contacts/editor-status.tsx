import { Button, InlineAlert } from "@home-hub/ui-web";

export function EditorStatus({
  editor,
}: {
  editor: {
    error: string | undefined;
    isSaving: boolean;
    conflict: { fields: unknown } | null | undefined;
    retry: () => void;
    discard: () => void;
    replace: () => void;
  };
}) {
  if (!editor.error) {
    return null;
  }
  return (
    <InlineAlert role="alert" variant="danger">
      <p>{editor.error}</p>
      {editor.conflict ? (
        <details open className="mt-2 min-w-0">
          <summary className="text-sm">
            Saved version — review before replacing
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(editor.conflict.fields, null, 2)}
          </pre>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-2">
        {editor.conflict === undefined ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={editor.isSaving}
            onClick={editor.retry}
          >
            Retry
          </Button>
        ) : editor.conflict !== null ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={editor.isSaving}
            onClick={editor.replace}
          >
            Save my draft
          </Button>
        ) : null}
        <Button
          size="compact"
          variant="ghost"
          disabled={editor.isSaving}
          onClick={editor.discard}
        >
          {editor.conflict !== undefined ? "Use saved" : "Discard"}
        </Button>
      </div>
    </InlineAlert>
  );
}
