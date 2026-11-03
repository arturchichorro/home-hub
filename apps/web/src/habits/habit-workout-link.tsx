import { habitWorkoutModeSchema } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  DialogPopup,
  DialogRoot,
  IconButton,
  InlineAlert,
  Link2,
  SelectItem,
  SelectPopup,
  SelectRoot,
  SelectTrigger,
} from "@home-hub/ui-web";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type Props = {
  householdId: string;
  habitId: string;
  name: string;
  linked: boolean;
  disabled: boolean;
};
export function HabitWorkoutLink(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        className="size-11! shrink-0"
        aria-label={`Workout link for ${props.name}`}
        title={props.linked ? "Linked to workouts" : "Link workouts"}
        disabled={props.disabled}
        onClick={() => setOpen(true)}
      >
        <Link2
          aria-hidden="true"
          className={`size-4 ${props.linked ? "text-foreground" : "text-muted"}`}
        />
      </IconButton>
      {open && (
        <HabitWorkoutLinkDialog {...props} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function HabitWorkoutLinkDialog({
  householdId,
  habitId,
  name,
  onClose,
}: Props & { onClose: () => void }) {
  const [settings, settingsResult] = useQuery(
    queries.habits.workoutSettings({ householdId, habitId }),
  );
  const [workouts, workoutResult] = useQuery(
    queries.habits.workoutChoices({ householdId }),
  );
  const [modules, moduleResult] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  useBlockAppUpdate(true);
  const loaded =
    settingsResult.type === "complete" &&
    workoutResult.type === "complete" &&
    moduleResult.type === "complete";
  const [initial, setInitial] = useState<{
    mode: "none" | "any" | "selected";
    ids: string[];
    workouts: readonly { id: string; title: string }[];
  }>();
  useEffect(() => {
    if (!initial && loaded && settings)
      setInitial({
        mode: settings.workoutMode ?? "none",
        ids: settings.workoutLinks.map((link) => link.workoutId),
        workouts,
      });
  }, [initial, loaded, settings, workouts]);
  const failed = [
    settingsResult.type,
    workoutResult.type,
    moduleResult.type,
  ].includes("error");
  if (initial)
    return (
      <WorkoutLinkEditor
        householdId={householdId}
        habitId={habitId}
        name={name}
        initialMode={initial.mode}
        initialIds={initial.ids}
        workouts={
          workoutResult.type === "complete" ? workouts : initial.workouts
        }
        workoutsEnabled={modules.some(
          (module) => module.moduleKey === "workouts" && module.enabled,
        )}
        onClose={onClose}
      />
    );
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        title={`Workout link for ${name}`}
        actions={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p role={failed ? "alert" : "status"}>
          {failed || loaded
            ? "Unable to load workout linking settings."
            : "Loading workouts…"}
        </p>
      </DialogPopup>
    </DialogRoot>
  );
}
const modes = [
  { value: "none", label: "Manual only" },
  { value: "any", label: "Any workout" },
  { value: "selected", label: "Selected workouts" },
];
function WorkoutLinkEditor({
  householdId,
  habitId,
  name,
  initialMode,
  initialIds,
  workouts,
  workoutsEnabled,
  onClose,
}: {
  householdId: string;
  habitId: string;
  name: string;
  initialMode: "none" | "any" | "selected";
  initialIds: string[];
  workouts: readonly { id: string; title: string }[];
  workoutsEnabled: boolean;
  onClose: () => void;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const enabled = useZeroMutationEnabled() && connection.name === "connected";
  const [mode, setMode] = useState(initialMode),
    [ids, setIds] = useState(initialIds);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string>();
  useBlockAppUpdate(saving);
  useBlocker({
    shouldBlockFn: () => saving,
    enableBeforeUnload: () => saving,
    withResolver: false,
  });
  async function save() {
    if (saving || !enabled) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.habits.linkWorkouts({
            householdId,
            habitId,
            mode,
            workoutIds: mode === "selected" ? ids : [],
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (result.type === "error") throw Error("save");
      onClose();
    } catch {
      setError("Unable to save workout links. Your selection is still here.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogPopup
        title={`Workout link for ${name}`}
        actions={
          <>
            <Button variant="ghost" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              busy={saving}
              disabled={
                !enabled ||
                saving ||
                (mode !== "none" && !workoutsEnabled) ||
                (mode === "selected" && !ids.length)
              }
              onClick={() => void save()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid min-w-0 gap-3">
          <SelectRoot
            value={mode}
            items={modes}
            disabled={saving}
            onValueChange={(value) => {
              const parsed = habitWorkoutModeSchema.safeParse(value);
              if (parsed.success) setMode(parsed.data);
            }}
          >
            <SelectTrigger aria-label="Complete this habit from" />
            <SelectPopup>
              {modes.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </SelectRoot>
          {!workoutsEnabled && (
            <p className="text-sm text-muted">
              Enable the Workouts module to link this habit. Manual tracking is
              still available.
            </p>
          )}
          {mode === "selected" && (
            <fieldset
              disabled={saving || !workoutsEnabled}
              className="grid max-h-60 gap-2 overflow-y-auto"
              aria-label="Workouts that count"
            >
              {workouts.map((workout) => (
                <label
                  key={workout.id}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(workout.id)}
                    onChange={(event) =>
                      setIds((previous) =>
                        event.target.checked
                          ? [...previous, workout.id]
                          : previous.filter((id) => id !== workout.id),
                      )
                    }
                  />
                  {workout.title}
                </label>
              ))}
              {!workouts.length && (
                <p className="text-sm text-muted">No workouts available.</p>
              )}
            </fieldset>
          )}
          <p className="text-xs text-muted">
            A workout counts once it has a saved set. Existing matching logs
            count too, using each person's logged local date.
          </p>
          <p className="text-xs text-muted">
            Manual checks and notes stay separate. Removing the last matching
            set only removes the automatic X; changing links recalculates
            automatic history.
          </p>
          <p className="text-xs text-muted">
            Only completion is shared as habit activity; workout notes and sets
            stay private.
          </p>
          {error && (
            <InlineAlert role="alert" variant="danger">
              {error}
            </InlineAlert>
          )}
        </div>
      </DialogPopup>
    </DialogRoot>
  );
}
