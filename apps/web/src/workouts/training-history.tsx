import {
  compareTrainingHistory,
  type TrainingHistoryCursor,
  trainingHistoryPageSize,
} from "@home-hub/shared/training";
import { workoutLogSnapshotSchema } from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  Calendar,
  ConfirmationPopover,
  IconButton,
  InlineAlert,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

export function TrainingHistoryPage({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const navigate = useNavigate();
  const [cursors, setCursors] = useState<TrainingHistoryCursor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useAppHeaderRightComponent(null);

  const args = { householdId, cursor: cursors.at(-1) };
  const [free, freeResult] = useQuery(queries.training.history(args));
  const [workouts, workoutResult] = useQuery(queries.training.workouts(args));
  const rows = useMemo(
    () =>
      [
        ...free.map((log) => ({
          kind: "free" as const,
          log,
          title: log.name || "Free training",
        })),
        ...workouts.map((log) => ({
          kind: "workout" as const,
          log,
          title: workoutLogSnapshotSchema.parse(log.snapshot).title,
        })),
      ].sort(compareTrainingHistory),
    [free, workouts],
  );
  const ready =
    freeResult.type === "complete" && workoutResult.type === "complete";

  async function remove(logId: string) {
    if (!enabled || busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.training.delete({
            householdId,
            logId,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );

      if (result.type !== "success") {
        throw Error("delete");
      }
    } catch {
      setError("Unable to delete this session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-2" aria-label="Training history">
      {(error ||
        freeResult.type === "error" ||
        workoutResult.type === "error") && (
        <InlineAlert role="alert" variant="danger">
          {error || "Unable to load training history."}
        </InlineAlert>
      )}
      <ul className="divide-y divide-border">
        {rows.slice(0, trainingHistoryPageSize).map((entry) => {
          const origin = entry.kind === "free" ? "Free training" : "Workout";

          return (
            <li
              key={`${entry.kind}:${entry.log.id}`}
              className="flex min-w-0 items-center gap-2 py-1"
            >
              <button
                type="button"
                disabled={!ready || busy}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => {
                  if (entry.kind === "free") {
                    void navigate({
                      to: "/households/$householdId/workouts/sessions/$logId",
                      params: { householdId, logId: entry.log.id },
                    });
                  } else {
                    void navigate({
                      to: "/households/$householdId/workouts/$workoutId",
                      params: { householdId, workoutId: entry.log.workoutId },
                      search: { log: entry.log.id },
                    });
                  }
                }}
              >
                <Calendar
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
                <span className="min-w-0">
                  <span className="block text-xs text-muted">
                    {entry.log.completedOn}
                    {origin !== entry.title ? ` · ${origin}` : ""}
                  </span>
                  <span className="block truncate">{entry.title}</span>
                </span>
              </button>
              {entry.kind === "free" && (
                <ConfirmationPopover
                  trigger={
                    <IconButton
                      aria-label={`Delete ${entry.title} from ${entry.log.completedOn}`}
                      title="Delete session"
                      className="size-7!"
                      disabled={!ready || busy || !enabled}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </IconButton>
                  }
                  message="Delete this session and all its recorded sets and notes?"
                  confirmLabel="Delete session"
                  onConfirm={() => {
                    void remove(entry.log.id);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {!ready &&
        freeResult.type !== "error" &&
        workoutResult.type !== "error" && <p role="status">Loading history…</p>}
      {ready && !rows.length && (
        <p className="text-sm text-muted">No training logged yet.</p>
      )}
      <div className="flex gap-2">
        {cursors.length > 0 && (
          <Button
            variant="ghost"
            disabled={!ready || busy}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            Newer history
          </Button>
        )}
        {rows.length > trainingHistoryPageSize && (
          <Button
            variant="ghost"
            disabled={!ready || busy}
            onClick={() => {
              const entry = rows[trainingHistoryPageSize - 1];

              if (entry) {
                setCursors((old) => [
                  ...old,
                  {
                    id: entry.log.id,
                    completedOn: entry.log.completedOn,
                    completedAt: entry.log.completedAt,
                    kind: entry.kind,
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
