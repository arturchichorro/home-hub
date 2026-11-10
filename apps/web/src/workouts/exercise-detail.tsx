import { exerciseCatalogSchema } from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useState } from "react";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { CatalogExerciseEditor } from "./exercise-catalog";
import { ExerciseStatistics } from "./exercise-statistics";
import { TrainingHistoryPage } from "./training-history";
import type { CatalogSaveResult } from "./use-catalog-exercise-editor";
import { useExerciseStats } from "./use-exercise-stats";

export function ExerciseDetailPage({
  householdId,
  exerciseId,
}: {
  householdId: string;
  exerciseId: string;
}) {
  const [exercise, status] = useQuery(
    queries.training.exercise({ householdId, exerciseId }),
  );
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const stats = useExerciseStats(householdId, exerciseId, revision);

  if (!exercise) {
    return (
      <p role={status.type === "error" ? "alert" : "status"}>
        {status.type === "error"
          ? "Unable to load exercise."
          : status.type !== "complete"
            ? "Loading exercise…"
            : "This exercise is no longer available."}
      </p>
    );
  }

  const current = exerciseCatalogSchema.parse({
    id: exercise.id,
    name: exercise.name,
    unit: exercise.unit,
    load: exercise.load,
    unilateral: exercise.unilateral,
  });
  const retired = exercise.deletedAt !== null;
  const writable =
    enabled && status.type === "complete" && !retired && !deleting;

  return (
    <div className="grid min-w-0 gap-4">
      {error && (
        <InlineAlert variant="danger" role="alert">
          {error}
        </InlineAlert>
      )}
      {retired ? (
        <p className="text-xs text-muted">Removed from catalog</p>
      ) : (
        <CatalogExerciseEditor
          showDetails={false}
          householdId={householdId}
          initial={current}
          current={current}
          enabled={writable}
          onSaved={refresh}
          save={async (next, previous): Promise<CatalogSaveResult> => {
            if (!writable || !previous) {
              return { error: "Unable to save exercise." };
            }
            const changes = Object.fromEntries(
              (["name", "unit", "load", "unilateral"] as const)
                .filter((field) => next[field] !== previous[field])
                .map((field) => [field, next[field]]),
            );
            const result = await acknowledgeMutation(
              zero.mutate(
                mutators.workouts.updateExercise({
                  householdId,
                  exerciseId,
                  optimisticTimestamp: Date.now(),
                  changes,
                }),
              ),
            );
            return result.type === "success"
              ? { exercise: next }
              : {
                  error:
                    "Unable to save exercise. Your changes are still here.",
                };
          }}
          onDelete={() => {
            if (!writable) {
              return;
            }
            setDeleting(true);
            setError("");
            void acknowledgeMutation(
              zero.mutate(
                mutators.workouts.deleteExercise({
                  householdId,
                  exerciseId,
                  optimisticTimestamp: Date.now(),
                }),
              ),
            )
              .then((result) => {
                if (result.type !== "success") {
                  setError("Unable to delete exercise.");
                }
              })
              .catch(() => setError("Unable to delete exercise."))
              .finally(() => {
                setDeleting(false);
                refresh();
              });
          }}
        />
      )}
      {stats.data ? (
        <ExerciseStatistics stats={stats.data} />
      ) : stats.error ? (
        <InlineAlert variant="danger" role="alert">
          {stats.error}
          <Button variant="ghost" onClick={refresh}>
            Retry
          </Button>
        </InlineAlert>
      ) : (
        <p role="status" className="text-sm text-muted">
          Loading statistics…
        </p>
      )}
      <div className="grid gap-2">
        <h2 className="text-sm font-medium">History</h2>
        <TrainingHistoryPage
          householdId={householdId}
          exerciseId={exerciseId}
          onPerformanceChange={refresh}
        />
      </div>
    </div>
  );
}
