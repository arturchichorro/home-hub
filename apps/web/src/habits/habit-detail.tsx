import { clampHabitMonth } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  IconButton,
  InlineAlert,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useBlockAppUpdate } from "../updates/activity";
import { HabitHistory } from "./habit-history";
import { HabitNameInput } from "./habit-name-input";
import { HabitNoteInput } from "./habit-note-input";
import { HabitPersonSelect } from "./habit-person-select";
import { HabitStatistics } from "./habit-statistics";
import { HabitWorkoutLink } from "./habit-workout-link";
import { useHabitStats } from "./use-habit-stats";
import { useHabitView } from "./use-habit-view";

export function HabitDetailPage({
  householdId,
  habitId,
  person,
}: {
  householdId: string;
  habitId: string;
  person?: string | undefined;
}) {
  const { userID } = useZero();
  return userID ? (
    <HabitDetail
      key={`${householdId}:${habitId}`}
      householdId={householdId}
      habitId={habitId}
      currentUserId={userID}
      person={person}
    />
  ) : null;
}

function HabitDetail({
  householdId,
  habitId,
  currentUserId,
  person,
}: {
  householdId: string;
  habitId: string;
  currentUserId: string;
  person: string | undefined;
}) {
  const view = useHabitView(householdId, currentUserId, person);
  const navigate = useNavigate();
  const manageRef = useRef<HTMLButtonElement>(null);
  const personRef = useRef<HTMLButtonElement>(null);
  const [habit, result] = useQuery(
    queries.habits.detail({ householdId, habitId }),
  );
  const [date, setDate] = useState<string>();
  const selected = date ?? view.today;
  const [management, setManagement] = useState<"rename" | "archive">();
  const [revision, setRevision] = useState(0);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const archived = habit?.status === "archived";
  const stats = useHabitStats(
    householdId,
    habitId,
    view.personId,
    revision,
    view.today,
    !!habit && !view.locked && view.memberResult.type === "complete",
  );
  useBlockAppUpdate(management !== undefined);
  useEffect(() => {
    if (!view.locked && selected > view.today) {
      setDate(undefined);
    }
  }, [selected, view.today, view.locked]);

  const actions = useMemo(
    () =>
      habit && !archived ? (
        <div className="flex items-center gap-1">
          <HabitWorkoutLink
            householdId={householdId}
            habitId={habitId}
            name={habit.name}
            linked={!!habit.workoutMode && habit.workoutMode !== "none"}
            disabled={!view.enabled || view.locked}
          />
          <MenuRoot>
            <MenuTrigger
              render={
                <IconButton
                  ref={manageRef}
                  aria-label="Manage habit"
                  disabled={view.locked || !view.enabled}
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </IconButton>
              }
            />
            <MenuPopup align="end">
              <MenuItem
                disabled={!view.enabled || view.locked}
                onClick={() => setManagement("rename")}
              >
                Rename
              </MenuItem>
              <MenuItem
                disabled={!view.enabled || view.locked}
                onClick={() => setManagement("archive")}
              >
                Archive
              </MenuItem>
            </MenuPopup>
          </MenuRoot>
        </div>
      ) : null,
    [habit, archived, householdId, habitId, view.enabled, view.locked],
  );
  useAppHeaderRightComponent(actions);

  if (result.type === "error" || view.memberResult.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load habit.
      </InlineAlert>
    );
  }
  if (!habit) {
    return (
      <p className="text-sm text-muted">
        {result.type === "complete" ? "Habit not found." : "Loading habit…"}
      </p>
    );
  }

  return (
    <div className="grid w-full min-w-0 max-w-2xl gap-4">
      <div className="flex items-center justify-between gap-2">
        <HabitPersonSelect
          view={view}
          triggerRef={personRef}
          currentUserId={currentUserId}
          onChange={(person) => {
            void navigate({
              to: "/households/$householdId/habits/$habitId",
              params: { householdId, habitId },
              search: { person, archived },
            });
          }}
        />
        {archived && <span className="text-xs text-muted">Archived</span>}
      </div>
      {view.error && (
        <InlineAlert role="alert" variant="danger">
          {view.error}
        </InlineAlert>
      )}

      <HabitHistory
        key={view.personId}
        householdId={householdId}
        habitId={habitId}
        name={habit.name}
        personId={view.personId}
        own={view.own}
        archived={archived}
        today={view.today}
        anchor={selected}
        selectedDate={selected}
        enabled={
          view.enabled &&
          view.memberResult.type === "complete" &&
          result.type === "complete"
        }
        locked={view.locked}
        pending={view.pending}
        onMonth={(anchor) => {
          if (!view.locked) {
            setDate(
              anchor.slice(0, 7) === view.today.slice(0, 7)
                ? undefined
                : clampHabitMonth(anchor, view.today),
            );
          }
        }}
        onDate={(date) => {
          if (!view.locked) {
            setDate(date === view.today ? undefined : date);
          }
        }}
        onCompleted={(date, value) =>
          view.completed(habitId, date, value, archived)
        }
        onDirtyChange={(dirty) => view.dirtyChanged("day-note", dirty)}
        onEntriesChanged={changed}
      />
      {(!archived || habit.note) && (
        <section
          aria-label="Shared habit note"
          className="grid min-w-0 gap-1 border-t border-border pt-4"
        >
          <h2 className="text-xs font-normal text-muted">Shared note</h2>
          <HabitNoteInput
            multiline
            householdId={householdId}
            habitId={habitId}
            habitName={habit.name}
            currentNote={habit.note ?? null}
            readOnly={archived}
            disabled={result.type !== "complete"}
            onDirtyChange={(dirty) => view.dirtyChanged("shared-note", dirty)}
          />
        </section>
      )}
      <HabitStatistics
        data={stats.data}
        error={stats.error}
        archived={archived}
        onRetry={changed}
      />
      <DialogRoot
        open={management !== undefined}
        onOpenChange={(open) => {
          if (!open && !view.locked) {
            setManagement(undefined);
          }
        }}
        disablePointerDismissal={view.locked}
      >
        <DialogPopup
          finalFocus={() => manageRef.current ?? personRef.current ?? false}
          title={management === "rename" ? "Rename habit" : "Archive habit"}
          actions={
            management === "rename" ? (
              <DialogClose disabled={view.locked}>Done</DialogClose>
            ) : (
              <>
                <DialogClose disabled={view.locked}>Cancel</DialogClose>
                <Button
                  disabled={view.locked || !view.enabled}
                  onClick={async () => {
                    if (
                      await view.change(
                        habitId,
                        mutators.habits.archive({
                          householdId,
                          habitId,
                          optimisticTimestamp: Date.now(),
                        }),
                      )
                    ) {
                      setManagement(undefined);
                    }
                  }}
                >
                  Archive
                </Button>
              </>
            )
          }
        >
          {management === "rename" ? (
            <HabitNameInput
              compact
              currentName={habit.name}
              householdId={householdId}
              habitId={habitId}
              onDirtyChange={(dirty) => view.dirtyChanged("name", dirty)}
            />
          ) : (
            <p>Archive “{habit.name}”?</p>
          )}
        </DialogPopup>
      </DialogRoot>
    </div>
  );
}
