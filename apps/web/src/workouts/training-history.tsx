import { calendarDate } from "@home-hub/shared/habits";
import {
  type TrainingHistoryCursor,
  trainingHistoryPageSize,
} from "@home-hub/shared/training";
import { workoutExerciseRoleLabel } from "@home-hub/shared/workouts";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  IconButton,
  InlineAlert,
  MessageSquare,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useCallback, useEffect, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ExerciseDetailLink } from "./exercise-detail-link";
import { SourceLogLink } from "./source-log-link";
import type { TrainingSessionRow } from "./training-log-projection";
import { WorkoutLogNoteInput } from "./workout-log-note-input";
import { summarizeExercisePerformance } from "./workout-log-summary";

const day = () =>
  calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);

function useLocalDay() {
  const [today, setToday] = useState(day);
  useEffect(() => {
    const update = () => setToday(day());
    const interval = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
}

export function TrainingHistoryPage({
  householdId,
  exerciseId,
  onPerformanceChange,
}: {
  householdId: string;
  exerciseId?: string;
  onPerformanceChange?: (version: string) => void;
}) {
  const [cursors, setCursors] = useState<TrainingHistoryCursor[]>([]);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const today = useLocalDay();
  useAppHeaderRightComponent(null);
  const [sessions, result] = useQuery(
    queries.training.history({
      householdId,
      includeExercises: true,
      ...(exerciseId ? { exerciseId } : {}),
      cursor: cursors.at(-1),
    }),
  );
  const fingerprint = JSON.stringify(sessions);
  useEffect(() => {
    onPerformanceChange?.(fingerprint);
  }, [fingerprint, onPerformanceChange]);
  const ready = result.type === "complete";
  const blocked = !ready || dirty.size > 0;
  const dirtyChanged = useCallback((id: string, changed: boolean) => {
    setDirty((old) => {
      const next = new Set(old);
      if (changed) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return (
    <section
      className="grid min-w-0 gap-2"
      aria-label={exerciseId ? "Exercise history" : "Training history"}
    >
      {result.type === "error" && (
        <InlineAlert role="alert" variant="danger">
          Unable to load training history.
        </InlineAlert>
      )}
      <ul className="divide-y divide-border">
        {sessions.slice(0, trainingHistoryPageSize).map((log) => (
          <TrainingHistoryEntry
            key={log.id}
            log={log}
            today={today}
            exerciseOnly={Boolean(exerciseId)}
            ready={ready}
            onDirtyChange={dirtyChanged}
          />
        ))}
      </ul>
      {!ready && result.type !== "error" && (
        <p role="status">Loading history…</p>
      )}
      {ready && !sessions.length && (
        <p className="text-sm text-muted">No training logged yet.</p>
      )}
      <div className="flex gap-2">
        {cursors.length > 0 && (
          <Button
            variant="ghost"
            disabled={blocked}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            Newer history
          </Button>
        )}
        {sessions.length > trainingHistoryPageSize && (
          <Button
            variant="ghost"
            disabled={blocked}
            onClick={() => {
              const log = sessions[trainingHistoryPageSize - 1];
              if (log) {
                setCursors((old) => [
                  ...old,
                  {
                    id: log.id,
                    completedOn: log.completedOn,
                    completedAt: log.completedAt,
                  },
                ]);
              }
            }}
          >
            Load older history
          </Button>
        )}
      </div>
    </section>
  );
}

export function TrainingHistoryEntry({
  log,
  today,
  exerciseOnly,
  ready,
  onDirtyChange,
}: {
  log: TrainingSessionRow;
  today: string;
  exerciseOnly: boolean;
  ready: boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const enabled = useZeroMutationEnabled();
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const changed = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(log.id, value);
    },
    [log.id, onDirtyChange],
  );
  const editable = !exerciseOnly && log.completedOn === today;
  const showEditor =
    !exerciseOnly && ((editable && (editing || Boolean(log.note))) || dirty);
  const performed = log.exercises.filter((row) => row.sets.length > 0);

  return (
    <li className="grid min-w-0 gap-1 py-2" data-training-entry={log.id}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">
          {log.name || "Free training"}
        </span>
        <span className="shrink-0 text-xs text-muted">{log.completedOn}</span>
        <SourceLogLink log={log} />
      </div>
      <div className="grid gap-1 text-xs text-muted">
        {performed.length ? (
          performed.map((row) => (
            <div key={row.id} className="flex min-w-0 items-start gap-1">
              <p className="min-w-0 flex-1 break-words">
                <span className="font-medium">{row.name}</span>
                {row.role !== "workout" &&
                  ` · ${workoutExerciseRoleLabel(row.role)}`}{" "}
                — {summarizeExercisePerformance(row)}
                {row.performedOn !== log.completedOn && (
                  <span> · {row.performedOn}</span>
                )}
              </p>
              {!exerciseOnly && (
                <ExerciseDetailLink
                  householdId={log.householdId}
                  exerciseId={row.exerciseId}
                  name={row.name}
                />
              )}
            </div>
          ))
        ) : (
          <p>No sets logged.</p>
        )}
      </div>
      {!exerciseOnly && (
        <div className="flex min-w-0 items-center gap-2">
          {showEditor ? (
            <WorkoutLogNoteInput
              householdId={log.householdId}
              logId={log.id}
              note={log.note ?? ""}
              disabled={!ready || !editable || !enabled}
              focusOnMount={editing && !log.note}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              onDirtyChange={changed}
            />
          ) : log.note ? (
            <p className="whitespace-pre-wrap break-words text-sm text-muted">
              {log.note}
            </p>
          ) : (
            editable && (
              <IconButton
                aria-label={`Add note to log from ${log.completedOn}`}
                title="Add note"
                className="size-7!"
                disabled={!ready || !enabled}
                onClick={() => setEditing(true)}
              >
                <MessageSquare className="size-4" aria-hidden="true" />
              </IconButton>
            )
          )}
        </div>
      )}
    </li>
  );
}
