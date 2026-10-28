import { calendarDate, shiftCalendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ConfirmationPopover,
  IconButton,
  InlineAlert,
  StickyNote,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { HabitActions } from "./habit-actions";
import { HabitDayPreview, type HabitRow, HabitTodayToggle } from "./habit-days";
import { HabitEntryNote } from "./habit-entry-note";
import { HabitGrid } from "./habit-grid";
import { HabitHistory } from "./habit-history";
import { HabitNameDialog } from "./habit-name-dialog";
import { HabitNameInput } from "./habit-name-input";
import { HabitNoteInput } from "./habit-note-input";

const localToday = () =>
  calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
type Expanded = { habitId: string; anchor: string; date?: string | undefined };

export function HabitsPage({ householdId }: { householdId: string }) {
  const { userID } = useZero();
  return userID ? (
    <HabitsContent
      key={householdId}
      householdId={householdId}
      currentUserId={userID}
    />
  ) : null;
}
function HabitsContent({
  householdId,
  currentUserId,
}: {
  householdId: string;
  currentUserId: string;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [today, setToday] = useState(localToday);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [person, setPerson] = useState<string>();
  const [expanded, setExpanded] = useState<Expanded>();
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(new Set<string>());
  const locked = dirty.size > 0;
  const dirtyChanged = useCallback(
    (key: string, value: boolean) =>
      setDirty((previous) => {
        if (previous.has(key) === value) return previous;
        const next = new Set(previous);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  useBlockAppUpdate(pending.size > 0);
  const [members, memberResult] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );
  const personId =
    person && members.some((m) => m.userId === person) ? person : currentUserId;
  const own = personId === zero.userID;
  const [habits, result] = useQuery(
    queries.habits.recentForPerson({
      householdId,
      personId,
      startOn: shiftCalendarDate(today, -6),
      endOn: today,
      archived,
    }),
  );
  const loading =
    result.type !== "complete" || memberResult.type !== "complete";
  const headerActions = useMemo(
    () => (
      <HabitActions
        archived={archived}
        navigationDisabled={locked}
        disabled={!enabled || locked}
        onToggleArchive={() => {
          if (!locked) {
            setArchived((v) => !v);
            setExpanded(undefined);
          }
        }}
        onCreate={() => setCreating(true)}
      />
    ),
    [archived, enabled, locked],
  );
  useAppHeaderRightComponent(headerActions);
  useEffect(() => {
    const update = () => {
      if (!locked) setToday(localToday());
    };
    update();
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [locked]);
  async function change(
    key: string,
    request: Parameters<typeof zero.mutate>[0],
  ) {
    if (!enabled || pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPending(new Set(pendingRef.current));
    setError(undefined);
    try {
      const mutation = zero.mutate(request),
        client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") setError("Unable to save.");
    } catch {
      setError("Unable to save.");
    } finally {
      pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
    }
  }
  function completed(habitId: string, date: string, value: boolean) {
    if (!own || archived || loading || date > today) return;
    void change(
      `${habitId}:${date}`,
      mutators.habits.setCompleted({
        householdId,
        habitId,
        entryOn: date,
        completed: value,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        optimisticTimestamp: Date.now(),
      }),
    );
  }
  function inspect(habitId: string, date?: string) {
    if (!locked) setExpanded({ habitId, anchor: date ?? today, date });
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="View activity for"
          className="h-11 max-w-full rounded-md bg-canvas text-sm outline-offset-2"
          value={personId}
          disabled={locked || memberResult.type !== "complete"}
          onChange={(e) => {
            if (!locked) {
              setPerson(e.target.value);
              setExpanded(undefined);
            }
          }}
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === zero.userID ? "Me" : (m.user?.username ?? "Member")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {archived ? "Archived habits" : "Today"}
        </span>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      {result.type === "error" || memberResult.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load habits and household members.
        </InlineAlert>
      ) : null}
      <HabitGrid
        habits={habits}
        disabled={!enabled || loading || archived || pending.has("habit-order")}
        archived={archived}
        loading={loading}
        onMove={(habitId, orderedHabitIds) =>
          void change(
            "habit-order",
            mutators.habits.reorder({
              householdId,
              habitId,
              orderedHabitIds,
              optimisticTimestamp: Date.now(),
            }),
          )
        }
      >
        {(habit, handle) => (
          <HabitListRow
            habit={habit}
            handle={handle}
            householdId={householdId}
            personId={personId}
            own={own}
            archived={archived}
            today={today}
            enabled={enabled && !loading}
            pending={pending}
            locked={locked}
            expanded={expanded?.habitId === habit.id ? expanded : undefined}
            onInspect={(date) => inspect(habit.id, date)}
            onDisclosure={() => {
              if (!locked)
                setExpanded((current) =>
                  current?.habitId === habit.id
                    ? undefined
                    : { habitId: habit.id, anchor: today },
                );
            }}
            onMonth={(anchor) => {
              if (!locked) setExpanded({ habitId: habit.id, anchor });
            }}
            onCompleted={(date, value) => completed(habit.id, date, value)}
            dirtyChanged={(key, value) =>
              dirtyChanged(`${habit.id}:${key}`, value)
            }
            onArchive={() =>
              change(
                habit.id,
                mutators.habits.archive({
                  householdId,
                  habitId: habit.id,
                  optimisticTimestamp: Date.now(),
                }),
              )
            }
          />
        )}
      </HabitGrid>
      {!habits.length && result.type !== "error" ? (
        <p className="text-muted">
          {loading
            ? "Loading habits…"
            : archived
              ? "No archived habits."
              : "No habits."}
        </p>
      ) : null}
      {creating ? (
        <HabitNameDialog
          householdId={householdId}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function HabitListRow({
  habit,
  handle,
  householdId,
  personId,
  own,
  archived,
  today,
  enabled,
  pending,
  locked,
  expanded,
  onInspect,
  onDisclosure,
  onMonth,
  onCompleted,
  dirtyChanged,
  onArchive,
}: {
  habit: HabitRow;
  handle: ReactNode;
  householdId: string;
  personId: string;
  own: boolean;
  archived: boolean;
  today: string;
  enabled: boolean;
  pending: ReadonlySet<string>;
  locked: boolean;
  expanded?: Expanded | undefined;
  onInspect: (date: string) => void;
  onDisclosure: () => void;
  onMonth: (date: string) => void;
  onCompleted: (date: string, value: boolean) => void;
  dirtyChanged: (key: string, value: boolean) => void;
  onArchive: () => Promise<void>;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const entries = new Map(
    habit.entries
      .filter((e) => e.userId === personId)
      .map((e) => [e.entryOn, e]),
  );
  const current = entries.get(today);
  return (
    <>
      <div className="flex min-w-0 items-center">
        {handle}
        {archived ? (
          <span className="min-w-0 flex-1 break-words text-sm font-medium">
            {habit.name}
          </span>
        ) : (
          <HabitNameInput
            compact
            currentName={habit.name}
            householdId={householdId}
            habitId={habit.id}
            disabled={!enabled}
            onDirtyChange={(v) => dirtyChanged("name", v)}
          />
        )}
        {!archived ? (
          <HabitTodayToggle
            name={habit.name}
            date={today}
            completed={!!current?.completed}
            disabled={!own || !enabled || pending.has(`${habit.id}:${today}`)}
            onToggle={() => onCompleted(today, !current?.completed)}
          />
        ) : null}
        <IconButton
          className="size-11! shrink-0"
          aria-label={`Show today's note for ${habit.name}`}
          aria-expanded={noteOpen && expanded?.date !== today}
          disabled={locked}
          onClick={() => {
            setNoteOpen((v) => expanded?.date === today || !v);
            if (expanded?.date === today) onMonth(expanded.anchor);
          }}
        >
          <StickyNote
            className={`size-4 ${current?.note ? "text-foreground" : "text-muted"}`}
            aria-hidden="true"
          />
        </IconButton>
        <IconButton
          className="size-11! shrink-0"
          aria-label={`History for ${habit.name}`}
          aria-expanded={!!expanded}
          disabled={locked}
          onClick={onDisclosure}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </IconButton>
      </div>
      <fieldset
        className="flex min-w-0 justify-between sm:justify-start"
        aria-label={`Recent days for ${habit.name}`}
      >
        {Array.from({ length: 6 }, (_, i) =>
          shiftCalendarDate(today, i - 6),
        ).map((date) => (
          <HabitDayPreview
            key={date}
            name={habit.name}
            date={date}
            entry={entries.get(date)}
            today={today}
            disabled={locked}
            selected={expanded?.date === date}
            onInspect={() => onInspect(date)}
          />
        ))}
      </fieldset>
      {noteOpen && expanded?.date !== today ? (
        <HabitEntryNote
          key={`${personId}:${today}`}
          householdId={householdId}
          habitId={habit.id}
          name={habit.name}
          date={today}
          note={current?.note ?? null}
          readOnly={!own || archived}
          initiallyOpen
          hideTrigger
          onDirtyChange={(v) => dirtyChanged("today-note", v)}
        />
      ) : null}
      {expanded ? (
        <>
          <HabitHistory
            key={`${personId}:${expanded.anchor.slice(0, 7)}`}
            householdId={householdId}
            habitId={habit.id}
            name={habit.name}
            personId={personId}
            own={own}
            archived={archived}
            today={today}
            anchor={expanded.anchor}
            selectedDate={expanded.date}
            enabled={enabled}
            locked={locked}
            pending={pending}
            onMonth={onMonth}
            onDate={onInspect}
            onCompleted={onCompleted}
            onDirtyChange={(v) => dirtyChanged("history-note", v)}
          />
          <div className="flex min-w-0 items-center gap-2">
            <HabitNoteInput
              householdId={householdId}
              habitId={habit.id}
              habitName={habit.name}
              currentNote={habit.note ?? null}
              readOnly={archived}
              onDirtyChange={(v) => dirtyChanged("shared-note", v)}
            />
            {!archived ? (
              <ConfirmationPopover
                confirmLabel="Archive"
                message={`Archive “${habit.name}”?`}
                trigger={
                  <IconButton
                    aria-label={`Archive ${habit.name}`}
                    className="ml-auto"
                    disabled={!enabled || locked || pending.has(habit.id)}
                  >
                    <Archive className="size-4" aria-hidden="true" />
                  </IconButton>
                }
                onConfirm={onArchive}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
