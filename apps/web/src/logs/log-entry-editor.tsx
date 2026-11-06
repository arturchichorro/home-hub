import type { LogEntrySnapshot } from "@home-hub/shared/logs";
import { Button, InlineAlert, Textarea } from "@home-hub/ui-web";
import { useCallback, useLayoutEffect, useRef } from "react";
import { TextDraftGuard } from "../editing/text-draft-actions";
import type { MediaSession } from "../media/session";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { useLogNote } from "./use-log-note";

export function LogEntryEditor({
  householdId,
  logId,
  entryOn,
  entry,
  session,
  onWork,
  future = false,
}: {
  householdId: string;
  logId: string;
  entryOn: string;
  entry: LogEntrySnapshot | null;
  session: MediaSession;
  onWork: (date: string, busy: boolean) => void;
  future?: boolean;
}) {
  const enabled = useZeroMutationEnabled();
  const ref = useRef<HTMLTextAreaElement>(null);
  const report = useCallback(
    (busy: boolean) => onWork(entryOn, busy),
    [onWork, entryOn],
  );
  const editor = useLogNote({
    householdId,
    logId,
    entryOn,
    entry,
    session,
    enabled,
    onWork: report,
  });
  useBlockAppUpdate(editor.hasChanges || editor.isSaving);

  const hasEntry = !!entry;

  useLayoutEffect(() => {
    void editor.value;
    void hasEntry;

    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [editor.value, hasEntry]);

  return (
    <div className="grid min-w-0 gap-2">
      <Textarea
        ref={ref}
        appearance="seamless"
        aria-label={`Note for ${entryOn}`}
        aria-busy={editor.isSaving || undefined}
        aria-invalid={!!editor.error}
        rows={3}
        maxLength={20000}
        className={`${hasEntry ? "min-h-10!" : "min-h-24!"} resize-none overflow-hidden px-0! text-sm leading-relaxed`}
        placeholder={
          future && !entry
            ? "Choose today or a past day to add an entry."
            : "Write a note…"
        }
        value={editor.value}
        disabled={!enabled || (future && !entry && !editor.hasChanges)}
        onChange={(e) => editor.changeValue(e.target.value)}
        onBlur={editor.handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !editor.isSaving) {
            e.preventDefault();
            editor.discard();
            e.currentTarget.blur();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            editor.handleBlur();
          }
        }}
      />
      {editor.isSaving ? (
        <span className="text-xs text-muted" role="status">
          Saving…
        </span>
      ) : null}
      {editor.hasConflict ? (
        <InlineAlert role="alert" variant="danger">
          <p>{editor.error}</p>
          <p className="mt-2 text-xs font-medium">Latest saved note</p>
          <pre className="my-2 max-h-60 overflow-auto font-sans text-sm whitespace-pre-wrap">
            {editor.conflict?.note ?? "This entry was removed."}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              size="compact"
              variant="ghost"
              disabled={editor.isSaving}
              onPointerDown={(e) => e.preventDefault()}
              onClick={editor.discard}
            >
              Use saved
            </Button>
            <Button
              size="compact"
              disabled={!enabled || editor.isSaving}
              onPointerDown={(e) => e.preventDefault()}
              onClick={editor.replace}
            >
              Save my draft
            </Button>
          </div>
        </InlineAlert>
      ) : editor.error ? (
        <InlineAlert role="alert" variant="danger">
          {editor.error}
          <div className="flex gap-2">
            <Button
              size="compact"
              variant="ghost"
              disabled={!enabled || editor.isSaving}
              onPointerDown={(e) => e.preventDefault()}
              onClick={editor.retry}
            >
              Retry
            </Button>
            <Button
              size="compact"
              variant="ghost"
              disabled={editor.isSaving}
              onPointerDown={(e) => e.preventDefault()}
              onClick={editor.discard}
            >
              Discard
            </Button>
          </div>
        </InlineAlert>
      ) : null}
      {editor.hasChanges ? <TextDraftGuard editor={editor} /> : null}
    </div>
  );
}
