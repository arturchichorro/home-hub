import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { normalizeExerciseName } from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  Check,
  IconButton,
  InlineAlert,
  Input,
  Plus,
  X,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ExerciseCatalog } from "./exercise-catalog";
import { WorkoutList } from "./workout-list";

export function WorkoutsLibrary({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const navigate = useNavigate();
  const [workouts, result] = useQuery(
    queries.workouts.byHousehold({ householdId }),
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const header = useMemo(
    () => (
      <Button
        variant="ghost"
        className="h-7! px-1.5! font-normal text-muted"
        disabled={!enabled || busy}
        onClick={() => setCreating(true)}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add workout
      </Button>
    ),
    [enabled, busy],
  );
  useAppHeaderRightComponent(header);
  async function save(request: Parameters<typeof zero.mutate>[0]) {
    if (!enabled || busy) return false;
    setBusy(true);
    setError("");
    try {
      const mutation = zero.mutate(request);
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") throw new Error("save");
      return true;
    } catch {
      setError("Unable to save workout.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="grid min-w-0 gap-4"
      aria-label="Workouts"
      aria-busy={result.type !== "complete"}
    >
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {result.type === "error" && (
        <InlineAlert role="alert" variant="danger">
          Unable to load workouts.
        </InlineAlert>
      )}
      {creating && (
        <form
          className="flex min-w-0 items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const workoutId = crypto.randomUUID();
            if (
              await save(
                mutators.workouts.create({
                  householdId,
                  workoutId,
                  title: name,
                  optimisticTimestamp: Date.now(),
                }),
              )
            ) {
              setCreating(false);
              setName("");
              void navigate({
                to: "/households/$householdId/workouts/$workoutId",
                params: { householdId, workoutId },
              });
            }
          }}
        >
          <Input
            appearance="seamless"
            aria-label="New workout name"
            autoFocus
            placeholder="Workout name"
            maxLength={150}
            required
            value={name}
            disabled={!enabled || busy}
            onValueChange={setName}
          />
          <IconButton
            type="submit"
            aria-label="Create workout"
            disabled={!enabled || busy || !name.trim()}
          >
            <Check aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            aria-label="Cancel"
            onClick={() => setCreating(false)}
            disabled={busy}
          >
            <X aria-hidden="true" className="size-4" />
          </IconButton>
        </form>
      )}
      <WorkoutList
        workouts={workouts}
        disabled={!enabled || busy || result.type !== "complete"}
        onMove={(workoutId, orderedWorkoutIds) =>
          void save(
            mutators.workouts.reorder({
              householdId,
              workoutId,
              orderedWorkoutIds,
              optimisticTimestamp: Date.now(),
            }),
          )
        }
      />
      {result.type === "complete" && !workouts.length && (
        <div className="grid justify-items-start gap-3">
          <p className="text-sm text-muted">No workouts yet.</p>
          <Button
            variant="ghost"
            className="px-1! font-normal text-muted"
            disabled={!enabled || busy}
            onClick={() =>
              void save(
                mutators.workouts.importStarters({
                  householdId,
                  catalogExerciseIds: [
                    ...new Set(
                      starterWorkouts.flatMap((w) =>
                        w.exercises.map((e) => normalizeExerciseName(e.name)),
                      ),
                    ),
                  ].map(() => crypto.randomUUID()),
                  workoutIds: [
                    crypto.randomUUID(),
                    crypto.randomUUID(),
                    crypto.randomUUID(),
                  ],
                  optimisticTimestamp: Date.now(),
                }),
              )
            }
          >
            <Plus aria-hidden="true" className="size-4" />
            Add A/B/C workouts
          </Button>
        </div>
      )}
      <ExerciseCatalog householdId={householdId} />
    </section>
  );
}
