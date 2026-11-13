import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { adjacentHabitMonth, calendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  IconButton,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  CalendarItemEditor,
  type CalendarRowControl,
} from "./calendar-item-editor";
import { CalendarMonth } from "./calendar-month";
import type { CalendarDraft } from "./use-calendar-editor";

const localToday = () =>
  calendarDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
type Item = { id: string; initial: CalendarDraft; existing: boolean };
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
  const moduleEnabled = settings.some(
    (s) => s.moduleKey === "calendar" && s.enabled,
  );
  const allowed =
    connected && memberResult.type === "complete" && moduleEnabled;
  const enabled = allowed && result.type === "complete";
  const zero = useZero();
  const controls = useRef(new Map<string, CalendarRowControl>());
  const [draft, setDraft] = useState<Item>();
  const [pinned, setPinned] = useState<Item>();
  const [ordering, setOrdering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const movingRef = useRef<string | undefined>(undefined);
  const [movingId, setMovingId] = useState<string>();
  const [, refresh] = useState(0);
  const onActivityChange = useCallback(() => refresh((n) => n + 1), []);
  const [orderError, setOrderError] = useState(false);
  const busy = ordering || dragging || switching || Boolean(movingId);
  useBlockAppUpdate(busy);
  useEffect(() => {
    const timer = setInterval(() => setToday(localToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  const snapshots = [...controls.current.values()].map((c) => c.snapshot());
  const anyDirty = snapshots.some((s) => s.hasChanges);
  const items: Item[] = (
    moduleEnabled ? rows.filter((r) => r.day === selected) : []
  ).map((row) => ({
    id: row.id,
    existing: true,
    initial: {
      title: row.title,
      note: row.note ?? "",
      day: row.day,
      people: row.people.map((p) => p.userId).sort(),
    },
  }));
  useEffect(() => {
    if (
      pinned &&
      rows.some((row) => row.id === pinned.id && row.day === selected)
    ) {
      setPinned(undefined);
    }
  }, [pinned, rows, selected]);
  function retain(item: Item | undefined) {
    if (item && !items.some((r) => r.id === item.id)) {
      items.push(item);
    }
  }
  retain(draft);
  retain(pinned);
  // Remote moves/deletes cannot unmount unsaved text in another row.
  for (const [id, control] of controls.current) {
    const snapshot = control.snapshot();
    if (snapshot.hasChanges || movingRef.current === id) {
      retain({ id, initial: snapshot.value, existing: snapshot.saved });
    }
  }
  function follow(day: string) {
    setSelected(day);
    setMonth(`${day.slice(0, 7)}-01`);
    setOrderError(false);
  }
  async function flushRows(except?: string) {
    for (const [id, control] of [...controls.current]) {
      if (id !== except && !(await control.flush())) {
        return false;
      }
    }
    return true;
  }
  async function switchScope(action: () => void) {
    if (busy || switchingRef.current || movingRef.current) {
      return false;
    }
    switchingRef.current = true;
    setSwitching(true);
    try {
      if (!(await flushRows())) {
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
      setDraft(undefined);
      setPinned(undefined);
      follow(day);
    });
  }
  function add() {
    return switchScope(() => {
      setPinned(undefined);
      setDraft({
        id: crypto.randomUUID(),
        existing: false,
        initial: { title: "", note: "", day: selected, people: [] },
      });
    });
  }
  async function beforeMove(id: string) {
    if (movingRef.current || switchingRef.current || ordering || dragging) {
      return false;
    }
    movingRef.current = id;
    setMovingId(id);
    if (!(await flushRows(id))) {
      endMove(id);
      return false;
    }
    return true;
  }
  function endMove(id: string) {
    if (movingRef.current === id) {
      movingRef.current = undefined;
      setMovingId(undefined);
    }
  }
  async function reorder(itemId: string, orderedIds: string[]) {
    if (!enabled || ordering || switching || movingRef.current || anyDirty) {
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
      <section className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-6">
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
              onClick={() => add()}
            >
              <Plus className="size-4" />
            </IconButton>
          </div>
          {result.type === "unknown" && rows.length === 0 && !draft && (
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
              if (
                !enabled ||
                anyDirty ||
                event.canceled ||
                !isSortable(source)
              ) {
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
              {items.map((item, index) => (
                <CalendarItemEditor
                  key={item.id}
                  householdId={householdId}
                  itemId={item.id}
                  initialValue={item.initial}
                  existing={item.existing}
                  enabled={allowed}
                  members={members}
                  index={index}
                  autoFocus={draft?.id === item.id}
                  orderDisabled={
                    !enabled ||
                    ordering ||
                    switching ||
                    Boolean(movingId) ||
                    anyDirty
                  }
                  blocked={
                    ordering ||
                    dragging ||
                    switching ||
                    Boolean(movingId && movingId !== item.id)
                  }
                  controls={(control) => {
                    if (control) {
                      controls.current.set(item.id, control);
                    } else {
                      controls.current.delete(item.id);
                    }
                  }}
                  onActivityChange={onActivityChange}
                  beforeMove={() => beforeMove(item.id)}
                  endMove={() => endMove(item.id)}
                  onFollow={(value) => {
                    setPinned({ id: item.id, initial: value, existing: true });
                    setDraft(undefined);
                    follow(value.day);
                  }}
                  onRemoved={() => {
                    controls.current.delete(item.id);
                    setDraft((d) => (d?.id === item.id ? undefined : d));
                    setPinned((d) => (d?.id === item.id ? undefined : d));
                    onActivityChange();
                  }}
                />
              ))}
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
          hasChanges: busy || anyDirty,
          isSaving: busy || snapshots.some((s) => s.isSaving),
          error: undefined,
          retry() {},
          discard() {
            for (const control of controls.current.values()) {
              control.discard();
            }
          },
        }}
      />
    </>
  );
}
