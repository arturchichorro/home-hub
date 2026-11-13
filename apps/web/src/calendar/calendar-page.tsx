import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { adjacentHabitMonth, calendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  IconButton,
  Plus,
  StickyNote,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import { TextDraftGuard } from "../editing/text-draft-actions";
import { HouseholdModuleGate } from "../households/household-module-gate";
import { useBlockAppUpdate } from "../updates/activity";
import {
  reorderedWorkoutIds,
  workoutOrderingSensors,
} from "../workouts/workout-list";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  type CalendarFocus,
  CalendarItemEditor,
  type CalendarRowControl,
} from "./calendar-item-editor";
import { CalendarMonth } from "./calendar-month";
import type { CalendarDraft } from "./use-calendar-editor";

const localToday = () =>
  calendarDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
type Item = {
  id: string;
  title: string;
  note: string | null;
  day: string;
  people: readonly {
    userId: string;
    member?: { user?: { username: string } | undefined } | undefined;
  }[];
};
type OpenItem = {
  id: string;
  initial: CalendarDraft;
  existing: boolean;
  focus: CalendarFocus;
};

export function CalendarPage({ householdId }: { householdId: string }) {
  const [today, setToday] = useState(localToday);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [rows, result] = useQuery(
    queries.calendar.month({ householdId, month }),
  );
  const [members, memberResult] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );
  const [settings] = useQuery(queries.modules.byHousehold({ householdId }));
  const connected = useZeroMutationEnabled();
  const allowed =
    connected &&
    memberResult.type === "complete" &&
    settings.some((s) => s.moduleKey === "calendar" && s.enabled);
  const enabled = allowed && result.type === "complete";
  const zero = useZero();
  const [open, setOpen] = useState<OpenItem>();
  const controls = useRef<CalendarRowControl>(null);
  const [ordering, setOrdering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const [orderError, setOrderError] = useState(false);
  useBlockAppUpdate(ordering || dragging || switching);
  useEffect(() => {
    const timer = setInterval(() => setToday(localToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  const dayItems = settings.some((s) => s.moduleKey === "calendar" && s.enabled)
    ? rows.filter((row) => row.day === selected)
    : [];
  // Keep the same editor mounted while a move changes the month subscription.
  const items: readonly Item[] =
    open && !dayItems.some((row) => row.id === open.id)
      ? [...dayItems, { id: open.id, ...open.initial, people: [] }]
      : dayItems;
  const busy = ordering || dragging || switching;
  function follow(day: string) {
    setSelected(day);
    setMonth(`${day.slice(0, 7)}-01`);
    setOrderError(false);
  }
  async function switchScope(action: () => void) {
    if (busy || switchingRef.current) {
      return false;
    }
    switchingRef.current = true;
    setSwitching(true);
    try {
      if (controls.current && !(await controls.current.flush())) {
        return false;
      }
      action();
      return true;
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }
  function select(day: string) {
    return switchScope(() => {
      setOpen(undefined);
      follow(day);
    });
  }
  function show(row?: Item, focus: CalendarFocus = "title") {
    return switchScope(() =>
      setOpen(
        row
          ? {
              id: row.id,
              initial: {
                title: row.title,
                note: row.note ?? "",
                day: row.day,
                people: row.people.map((p) => p.userId).sort(),
              },
              existing: true,
              focus,
            }
          : {
              id: crypto.randomUUID(),
              initial: { title: "", note: "", day: selected, people: [] },
              existing: false,
              focus,
            },
      ),
    );
  }
  async function reorder(itemId: string, orderedIds: string[]) {
    if (!enabled || ordering) {
      return;
    }
    setOrdering(true);
    setOrderError(false);
    try {
      const outcome = await acknowledgeMutation(
        zero.mutate(
          mutators.calendar.reorder({
            householdId,
            itemId,
            day: selected,
            orderedIds,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (outcome.type === "error") {
        throw Error("Reorder failed");
      }
    } catch {
      setOrderError(true);
    } finally {
      setOrdering(false);
    }
  }
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));
  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${selected}T12:00:00Z`));
  return (
    <>
      <section className="mx-auto grid w-full max-w-3xl gap-6">
        <HouseholdModuleGate householdId={householdId} moduleKey="calendar">
          <div className="grid gap-6">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-sm font-medium">{monthLabel}</h1>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={busy}
                  onClick={() => select(localToday())}
                >
                  Today
                </Button>
                <IconButton
                  aria-label="Previous month"
                  disabled={busy || month <= "0001-01-01"}
                  onClick={() => select(adjacentHabitMonth(month, -1))}
                >
                  <ChevronLeft className="size-4" />
                </IconButton>
                <IconButton
                  aria-label="Next month"
                  disabled={busy || month >= "9999-12-01"}
                  onClick={() => select(adjacentHabitMonth(month, 1))}
                >
                  <ChevronRight className="size-4" />
                </IconButton>
              </div>
            </div>
            {result.type === "error" ? (
              <p role="alert">Unable to load calendar items.</p>
            ) : (
              <CalendarMonth
                month={month}
                selected={selected}
                today={today}
                items={rows}
                disabled={busy}
                onSelect={select}
              />
            )}
          </div>
        </HouseholdModuleGate>
        <div>
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="text-sm font-medium">{dayLabel}</h2>
            <IconButton
              data-calendar-add
              aria-label="Add calendar item"
              disabled={!enabled || busy}
              onClick={() => show()}
            >
              <Plus className="size-4" />
            </IconButton>
          </div>
          {result.type === "unknown" && rows.length === 0 && !open && (
            <p role="status" className="py-3 text-sm text-muted">
              Loading calendar…
            </p>
          )}
          {result.type === "complete" && items.length === 0 && (
            <p className="py-3 text-sm text-muted">No items.</p>
          )}
          <DragDropProvider
            sensors={workoutOrderingSensors}
            onDragStart={() => setDragging(true)}
            onDragEnd={(event) => {
              setDragging(false);
              const source = event.operation.source;
              if (!enabled || open || event.canceled || !isSortable(source)) {
                return;
              }
              const move = reorderedWorkoutIds(
                items,
                items.findIndex((row) => row.id === source.id),
                source.index,
              );
              if (move) {
                void reorder(move.workoutId, move.orderedWorkoutIds);
              }
            }}
          >
            <ul className="divide-y divide-border">
              {items.map((item, index) =>
                open?.id === item.id ? (
                  <CalendarItemEditor
                    key={item.id}
                    householdId={householdId}
                    itemId={open.id}
                    initialValue={open.initial}
                    existing={open.existing}
                    enabled={allowed}
                    members={members}
                    focus={open.focus}
                    controls={controls}
                    onFollow={follow}
                    onClose={() => setOpen(undefined)}
                  />
                ) : (
                  <DayItem
                    key={item.id}
                    item={item}
                    index={index}
                    disabled={!enabled || ordering || Boolean(open)}
                    busy={busy}
                    open={(focus) => void show(item, focus)}
                  />
                ),
              )}
            </ul>
          </DragDropProvider>
          {orderError && (
            <p role="alert" className="text-sm text-danger">
              Unable to reorder items. Try moving the item again.
            </p>
          )}
        </div>
      </section>
      <TextDraftGuard
        editor={{
          hasChanges: busy,
          isSaving: busy,
          error: undefined,
          retry() {},
          discard() {},
        }}
      />
    </>
  );
}

function DayItem({
  item,
  index,
  disabled,
  busy,
  open,
}: {
  item: Item;
  index: number;
  disabled: boolean;
  busy: boolean;
  open: (focus: CalendarFocus) => void;
}) {
  const sortable = useSortable({
    id: item.id,
    index,
    type: "calendar-item",
    accept: "calendar-item",
    disabled,
  });
  const names = item.people
    .map((p) => p.member?.user?.username)
    .filter(Boolean)
    .join(", ");
  return (
    <li ref={sortable.ref} className="flex min-w-0 items-start gap-2 py-3">
      <IconButton
        ref={sortable.handleRef}
        disabled={disabled}
        aria-label={`Reorder ${item.title}`}
        className="shrink-0 touch-none"
      >
        <GripVertical className="size-4 text-muted" />
      </IconButton>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1">
          <button
            type="button"
            data-calendar-open={item.id}
            disabled={busy}
            className="min-w-0 flex-1 rounded-sm py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={() => open("title")}
          >
            <span className="block break-words font-medium">{item.title}</span>
            {names && (
              <span className="mt-1 block text-xs text-muted">{names}</span>
            )}
          </button>
          <IconButton
            aria-label={`Edit note for ${item.title}`}
            title="Note"
            disabled={busy}
            onClick={() => open("note")}
          >
            <StickyNote className="size-4" />
          </IconButton>
        </div>
        {item.note && (
          <button
            type="button"
            aria-label={`Edit note text for ${item.title}`}
            className="block w-full whitespace-pre-wrap break-words text-left text-xs text-muted"
            disabled={busy}
            onClick={() => open("note")}
          >
            {item.note}
          </button>
        )}
      </div>
    </li>
  );
}
