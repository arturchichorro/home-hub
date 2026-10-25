import { Check, IconButton, MessageSquare } from "@home-hub/ui-web";
import { useId, useState } from "react";
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
  const [editingNote, setEditingNote] = useState(false);
  const summaryId = useId();
  const hasNote = !!entry.note?.trim();
  const hasNoteEditor = hasNote || editingNote;
  const summary = summarizeWorkoutLog(entry);
  return (
    <li className="py-1">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            aria-pressed={selected}
            aria-describedby={summaryId}
            disabled={disabled}
            className="flex min-h-11 shrink-0 items-center gap-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={onSelect}
          >
            <Check aria-hidden="true" className="size-4 shrink-0 text-muted" />
            <span>
              {entry.completedOn}
              {hasNoteEditor ? ":" : null}
            </span>
          </button>
          {hasNoteEditor && (
            <WorkoutLogNoteInput
              householdId={householdId}
              workoutId={workoutId}
              logId={entry.id}
              note={entry.note ?? ""}
              focusOnMount={editingNote && !hasNote}
              disabled={disabled}
              onFocus={() => setEditingNote(true)}
              onBlur={() => setEditingNote(false)}
            />
          )}
        </div>
        {!hasNoteEditor && (
          <IconButton
            aria-label={`Add note to workout log from ${entry.completedOn}`}
            title="Add note"
            className="size-7!"
            disabled={disabled}
            onClick={() => setEditingNote(true)}
          >
            <MessageSquare aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </div>
      <div
        id={summaryId}
        className="grid min-w-0 gap-1 pb-2 pl-7 text-xs font-normal text-muted"
      >
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
      </div>
    </li>
  );
}
