import { habitCompleted, shiftCalendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Check,
  IconButton,
  InlineAlert,
  Link2,
  StickyNote,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { HabitActions } from "./habit-actions";
import { type HabitRow, HabitTodayToggle } from "./habit-days";
import { HabitEntryNote } from "./habit-entry-note";
import { HabitGrid } from "./habit-grid";
import { HabitNameDialog } from "./habit-name-dialog";
import { HabitPersonSelect } from "./habit-person-select";
import { HabitPreview } from "./habit-preview";
import { type HabitView, useHabitView } from "./use-habit-view";

export function HabitsPage({
  householdId,
  person,
  archived = false,
}: {
  householdId: string;
  person?: string | undefined;
  archived?: boolean | undefined;
}) {
  const { userID } = useZero();
  return userID ? (
    <HabitsContent
      key={householdId}
      householdId={householdId}
      currentUserId={userID}
      person={person}
      archived={archived}
    />
  ) : null;
}

function HabitsContent({
  householdId,
  currentUserId,
  person,
  archived,
}: {
  householdId: string;
  currentUserId: string;
  person: string | undefined;
  archived: boolean;
}) {
  const view = useHabitView(householdId, currentUserId, person);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [habits, result] = useQuery(
    queries.habits.recentForPerson({
      householdId,
      personId: view.personId,
      startOn: shiftCalendarDate(view.today, -6),
      endOn: view.today,
      archived,
    }),
  );
  const loading =
    result.type !== "complete" || view.memberResult.type !== "complete";
  const header = useMemo(
    () => (
      <HabitActions
        archived={archived}
        disabled={!view.enabled || view.locked}
        navigationDisabled={view.locked}
        ordering={ordering}
        onToggleOrdering={() => setOrdering((value) => !value)}
        onCreate={() => setCreating(true)}
        onToggleArchive={() => {
          setOrdering(false);
          void navigate({
            to: "/households/$householdId/habits",
            params: { householdId },
            search: { person: view.personId, archived: !archived },
          });
        }}
      />
    ),
    [
      archived,
      ordering,
      view.enabled,
      view.locked,
      view.personId,
      navigate,
      householdId,
    ],
  );
  useAppHeaderRightComponent(header);

  return (
    <section aria-label="Habits overview" className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <HabitPersonSelect
          view={view}
          currentUserId={currentUserId}
          onChange={(person) => {
            void navigate({
              to: "/households/$householdId/habits",
              params: { householdId },
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
      {(result.type === "error" || view.memberResult.type === "error") && (
        <InlineAlert role="alert" variant="danger">
          Unable to load habits.
        </InlineAlert>
      )}
      <HabitGrid
        habits={habits}
        disabled={
          !view.enabled ||
          loading ||
          archived ||
          view.pending.has("habit-order")
        }
        archived={archived}
        ordering={ordering}
        loading={loading}
        onMove={(habitId, orderedHabitIds) => {
          void view.change(
            "habit-order",
            mutators.habits.reorder({
              householdId,
              habitId,
              orderedHabitIds,
              optimisticTimestamp: Date.now(),
            }),
          );
        }}
      >
        {(habit, handle) => (
          <HabitOverviewRow
            habit={habit}
            handle={handle}
            householdId={householdId}
            view={view}
            archived={archived}
            ready={!loading}
          />
        )}
      </HabitGrid>
      {!habits.length && result.type !== "error" && (
        <p className="text-sm text-muted" role={loading ? "status" : undefined}>
          {loading
            ? "Loading habits…"
            : archived
              ? "No archived habits."
              : "No habits yet."}
        </p>
      )}
      {creating && (
        <HabitNameDialog
          householdId={householdId}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function HabitOverviewRow({
  habit,
  handle,
  householdId,
  view,
  archived,
  ready,
}: {
  habit: HabitRow;
  handle: ReactNode;
  householdId: string;
  view: HabitView;
  archived: boolean;
  ready: boolean;
}) {
  const current = habit.entries.find(
    (entry) => entry.userId === view.personId && entry.entryOn === view.today,
  );
  const [noteOpen, setNoteOpen] = useState(Boolean(current?.note));
  const row = useRef<HTMLDivElement>(null);
  const auto = Boolean(current?.workoutCompleted);
  const completed = habitCompleted(current);
  const detail = {
    to: "/households/$householdId/habits/$habitId" as const,
    params: { householdId, habitId: habit.id },
    search: { person: view.personId, archived },
  };
  useEffect(() => {
    if (current?.note) {
      setNoteOpen(true);
    }
  }, [current?.note]);

  return (
    <div ref={row} className="grid min-w-0 gap-1 py-2" data-habit-id={habit.id}>
      <div className="flex min-w-0 items-center gap-1">
        {handle}
        {view.own && !archived && !auto ? (
          <HabitTodayToggle
            name={habit.name}
            date={view.today}
            completed={completed}
            pending={view.pending.has(`${habit.id}:${view.today}`)}
            disabled={
              !ready ||
              !view.enabled ||
              view.pending.has(`${habit.id}:${view.today}`)
            }
            onToggle={() => view.completed(habit.id, view.today, !completed)}
          />
        ) : (
          <Link
            {...detail}
            disabled={view.pending.size > 0}
            aria-label={`${habit.name}: ${auto ? "Completed from training" : completed ? "Completed" : "Not recorded"}. View details`}
            title={auto ? "From training" : "View habit"}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span
              className={`flex size-5 items-center justify-center rounded-sm border ${completed ? "border-foreground bg-foreground text-canvas" : "border-border"}`}
            >
              {completed && <Check aria-hidden="true" className="size-4" />}
            </span>
            {auto && (
              <Link2
                aria-hidden="true"
                className="absolute right-0 bottom-0 size-3 text-muted"
              />
            )}
          </Link>
        )}
        <Link
          {...detail}
          disabled={view.pending.size > 0}
          className="min-w-0 flex-1 break-words rounded-sm py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {habit.name}
        </Link>
        {auto && <span className="text-xs text-muted">Training</span>}
        {view.own && !archived && (
          <IconButton
            aria-label={`Edit today's note for ${habit.name}`}
            aria-expanded={noteOpen}
            disabled={view.locked}
            onClick={() => {
              setNoteOpen(true);
              requestAnimationFrame(() =>
                row.current?.querySelector("textarea")?.focus(),
              );
            }}
          >
            <StickyNote aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="min-w-0 pl-11">
        <HabitPreview
          name={habit.name}
          today={view.today}
          entries={habit.entries.filter(
            (entry) => entry.userId === view.personId,
          )}
        />
      </div>
      {noteOpen && (
        <div className="min-w-0 pl-11">
          <HabitEntryNote
            key={`${view.personId}:${view.today}`}
            householdId={householdId}
            habitId={habit.id}
            name={habit.name}
            date={view.today}
            note={current?.note ?? null}
            readOnly={!view.own || archived}
            disabled={!ready}
            initiallyOpen
            hideTrigger
            onDirtyChange={(dirty) =>
              view.dirtyChanged(`${habit.id}:today-note`, dirty)
            }
          />
        </div>
      )}
    </div>
  );
}
