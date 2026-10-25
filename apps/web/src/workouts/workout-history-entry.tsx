import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
  Check,
  IconButton,
  MessageSquare,
} from "@home-hub/ui-web";
import { useState } from "react";
import type { WorkoutLog } from "./workout-log";
import { WorkoutLogNoteInput } from "./workout-log-note-input";
import { summarizeWorkoutLog } from "./workout-log-summary";

export function WorkoutHistoryEntry({
  entry,
  householdId,
  workoutId,
  selected,
  disabled,
  onSelect,
}: {
  entry: WorkoutLog;
  householdId: string;
  workoutId: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [focusNote, setFocusNote] = useState(false);
  const hasNote = !!entry.note?.trim();
  const summary = summarizeWorkoutLog(entry);
  return (
    <li>
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          aria-pressed={selected}
          disabled={disabled}
          className="grid min-h-11 min-w-0 flex-1 gap-1 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={onSelect}
        >
          <span className="flex items-center gap-3">
            <Check aria-hidden="true" className="size-4 shrink-0 text-muted" />
            <span>{entry.completedOn}</span>
          </span>
          <span className="grid min-w-0 gap-1 pl-7 text-xs font-normal text-muted">
            {summary.length ? (
              summary.map((exercise) => (
                <span key={exercise.id} className="break-words">
                  <span className="font-medium">{exercise.name}</span> —{" "}
                  {exercise.details}
                </span>
              ))
            ) : (
              <span>No sets logged.</span>
            )}
          </span>
        </button>
        {!hasNote && !showNoteEditor && (
          <IconButton
            aria-label={`Add note to workout log from ${entry.completedOn}`}
            title="Add note"
            className="mt-1 size-7!"
            disabled={disabled}
            onClick={() => {
              setShowNoteEditor(true);
              setFocusNote(true);
              setOpen(["note"]);
            }}
          >
            <MessageSquare aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </div>
      {(hasNote || showNoteEditor) && (
        <AccordionRoot
          value={open}
          onValueChange={(value) => {
            setOpen(value);
            if (value.length) setShowNoteEditor(true);
          }}
          className="min-w-0 pb-2 pl-7"
        >
          <AccordionItem value="note">
            <AccordionHeader>
              <AccordionTrigger>Note</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <WorkoutLogNoteInput
                householdId={householdId}
                workoutId={workoutId}
                logId={entry.id}
                note={entry.note ?? ""}
                focusOnMount={focusNote}
                disabled={disabled}
              />
            </AccordionPanel>
          </AccordionItem>
        </AccordionRoot>
      )}
    </li>
  );
}
