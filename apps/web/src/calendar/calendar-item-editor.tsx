import { useSortable } from "@dnd-kit/react/sortable";
import {
  calendarChanges,
  calendarFieldsSchema,
} from "@home-hub/shared/calendar";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  Calendar,
  DialogPopup,
  DialogRoot,
  GripVertical,
  Input,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
  StickyNote,
  Textarea,
  X,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TextDraftActions } from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { CalendarPeoplePicker } from "./calendar-people-picker";
import {
  type CalendarDraft,
  type CalendarSaveResult,
  useCalendarEditor,
} from "./use-calendar-editor";

export type CalendarRowControl = {
  flush: () => Promise<boolean>;
  discard: () => void;
  snapshot: () => {
    value: CalendarDraft;
    hasChanges: boolean;
    isSaving: boolean;
    saved: boolean;
  };
};
type Row = {
  title: string;
  note: string | null;
  day: string;
  people: readonly { userId: string }[];
};
type Member = { userId: string; user?: { username: string } | undefined };

export function CalendarItemEditor({
  householdId,
  itemId,
  initialValue,
  existing,
  enabled,
  members,
  onRemoved,
  onFollow,
  beforeMove,
  endMove,
  onActivityChange,
  controls,
  index,
  orderDisabled,
  blocked,
  autoFocus = false,
}: {
  householdId: string;
  itemId: string;
  initialValue: CalendarDraft;
  existing: boolean;
  enabled: boolean;
  members: readonly Member[];
  onRemoved: () => void;
  onFollow: (value: CalendarDraft) => void;
  beforeMove: () => Promise<boolean>;
  endMove: () => void;
  onActivityChange: (dirty: boolean, saving: boolean) => void;
  controls: Ref<CalendarRowControl>;
  index: number;
  orderDisabled: boolean;
  blocked: boolean;
  autoFocus?: boolean;
}) {
  const [row, result] = useQuery(
    queries.calendar.item({ householdId, itemId }),
  );
  const loaded = result.type === "complete" || !existing;
  const zero = useZero();
  const titleInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const menuInput = useRef<HTMLButtonElement>(null);
  const skipFocus = useRef(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(initialValue.note));
  const [dayOpen, setDayOpen] = useState(false);
  const [dayDraft, setDayDraft] = useState(initialValue.day);
  const [dayError, setDayError] = useState<string>();
  const sortable = useSortable({
    id: itemId,
    index,
    type: "calendar-item",
    accept: "calendar-item",
    disabled: orderDisabled,
  });
  useEffect(() => {
    if (autoFocus) {
      titleInput.current?.focus();
    }
  }, [autoFocus]);

  const toDraft = (r: Row): CalendarDraft => ({
    title: r.title,
    note: r.note ?? "",
    day: r.day,
    people: r.people.map((p) => p.userId).sort(),
  });
  const [initial] = useState(initialValue);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBlockAppUpdate(deleting || confirmDelete || dayOpen);
  const base = () => ({ householdId, itemId, optimisticTimestamp: Date.now() });
  const editor = useCalendarEditor({
    initial,
    persisted: existing,
    current: row ? toDraft(row) : undefined,
    enabled: enabled && loaded,
    save: async (next, previous): Promise<CalendarSaveResult> => {
      const active = new Set(members.map((m) => m.userId));
      const desired = next.people.filter((p) => active.has(p));
      let confirmed = previous
        ? { ...previous, people: previous.people.filter((p) => active.has(p)) }
        : undefined;
      const moved = next.day !== (confirmed?.day ?? initialValue.day);
      try {
        if (moved && !(await beforeMove())) {
          throw Error("Resolve other calendar drafts first");
        }
        if (!confirmed) {
          const outcome = await acknowledgeMutation(
            zero.mutate(
              mutators.calendar.create({
                ...base(),
                title: next.title,
                note: next.note,
                day: next.day,
              }),
            ),
          );
          if (outcome.type === "error") {
            throw Error("Save failed");
          }
          confirmed = { ...next, people: [] };
          onFollow(next);
          setDayOpen(false);
        } else {
          const changes = calendarChanges(next, confirmed);
          if (Object.keys(changes).length > 0) {
            const outcome = await acknowledgeMutation(
              zero.mutate(mutators.calendar.update({ ...base(), changes })),
            );
            if (outcome.type === "error") {
              throw Error("Save failed");
            }
            const moved = next.day !== confirmed.day;
            confirmed = { ...confirmed, ...changes };
            if (moved) {
              onFollow(next);
              setDayOpen(false);
            }
          }
        }
        // Per-person deltas preserve hidden former-member links and independent edits.
        for (const userId of new Set([...confirmed.people, ...desired])) {
          const selected = desired.includes(userId);
          if (selected === confirmed.people.includes(userId)) {
            continue;
          }
          const outcome = await acknowledgeMutation(
            zero.mutate(
              mutators.calendar.person({ ...base(), userId, selected }),
            ),
          );
          if (outcome.type === "error") {
            throw Error("Save failed");
          }
          confirmed = {
            ...confirmed,
            people: (selected
              ? [...confirmed.people, userId]
              : confirmed.people.filter((p) => p !== userId)
            ).sort(),
          };
        }
        return { confirmed };
      } catch {
        return {
          confirmed,
          error: "Unable to save this item. Your changes are still here.",
        };
      } finally {
        if (moved) {
          endMove();
        }
      }
    },
  });
  const unavailable = editor.saved && result.type === "complete" && !row;
  const disabled = !enabled || !loaded || unavailable || deleting || blocked;
  function closeDay() {
    setDayOpen(false);
    setDayError(undefined);
    // Cancel a failed date move without discarding any title/note/people draft.
    if (
      editor.saved &&
      !editor.isSaving &&
      editor.value.day !== (row?.day ?? initial.day)
    ) {
      editor.change({ day: row?.day ?? initial.day }, true);
    }
  }
  async function moveDay() {
    if (disabled || editor.isSaving) {
      return;
    }
    if (!calendarFieldsSchema.shape.day.safeParse(dayDraft).success) {
      setDayError("Choose a valid day.");
      return;
    }
    setDayError(undefined);
    if (dayDraft === editor.value.day && !editor.error) {
      setDayOpen(false);
      return;
    }
    editor.change({ day: dayDraft }, true);
    if (!editor.saved && !editor.value.title.trim()) {
      setDayOpen(false);
      return;
    }
    if (await editor.flush()) {
      setDayOpen(false);
    }
  }
  async function remove() {
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(false);
    try {
      const outcome = await acknowledgeMutation(
        zero.mutate(mutators.calendar.delete(base())),
      );
      if (outcome.type === "error") {
        throw Error("Delete failed");
      }
      onRemoved();
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[data-calendar-add]")?.focus(),
      );
    } catch {
      setDeleteError(true);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  useImperativeHandle(controls, () => ({
    flush: editor.flush,
    discard: editor.discard,
    snapshot: () => ({
      value: editor.value,
      hasChanges: editor.hasChanges || deletingRef.current,
      isSaving: editor.isSaving || deletingRef.current,
      saved: editor.saved,
    }),
  }));
  useLayoutEffect(() => {
    onActivityChange(
      editor.hasChanges || deleting,
      editor.isSaving || deleting,
    );
  }, [editor.hasChanges, editor.isSaving, deleting, onActivityChange]);
  return (
    <>
      <li
        ref={sortable.ref}
        data-calendar-item={itemId}
        className="flex min-w-0 items-start gap-1 p-2"
      >
        <Button
          ref={sortable.handleRef}
          variant="ghost"
          size="compact"
          className="size-7! shrink-0 touch-none p-0!"
          aria-label={`Reorder ${editor.value.title || "calendar item"}`}
          disabled={orderDisabled}
        >
          <GripVertical aria-hidden="true" className="size-4 text-muted" />
        </Button>
        <div className="min-w-0 flex-1">
          <div
            className="flex h-7 min-w-0 items-center gap-1"
            data-calendar-line
          >
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                ref={titleInput}
                appearance="seamless"
                aria-label="Calendar item name"
                placeholder="Item name"
                className={`field-sizing-content h-7! min-w-0 flex-initial! px-1! text-sm leading-7 ${noteOpen || editor.value.note ? "max-w-[65%]" : "max-w-full"}`}
                value={editor.value.title}
                maxLength={150}
                required
                readOnly={disabled}
                onValueChange={(title) => editor.change({ title })}
                onBlur={() => {
                  if (!editor.error && editor.value.title.trim()) {
                    void editor.flush();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void editor.flush();
                  }
                }}
              />
              {(noteOpen || editor.value.note) && (
                <div
                  className="flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden"
                  data-calendar-note-inline
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-xs leading-7 text-muted"
                  >
                    —
                  </span>
                  <Textarea
                    ref={noteInput}
                    appearance="seamless"
                    aria-label="Calendar item note"
                    placeholder="Note"
                    title={editor.value.note}
                    className="field-sizing-fixed! h-7! min-h-7! min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-0! text-xs leading-7 text-muted whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    rows={1}
                    maxLength={10000}
                    value={editor.value.note}
                    readOnly={disabled}
                    onChange={(event) =>
                      editor.change({ note: event.target.value })
                    }
                    onBlur={() => {
                      if (!editor.error) {
                        void editor.flush();
                      }
                      if (!editor.value.note) {
                        setNoteOpen(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {!noteOpen && !editor.value.note && (
                <Button
                  variant="ghost"
                  size="compact"
                  className="size-7! p-0!"
                  aria-label="Add calendar note"
                  title="Note"
                  onClick={() => {
                    setNoteOpen(true);
                    requestAnimationFrame(() => noteInput.current?.focus());
                  }}
                >
                  <StickyNote aria-hidden="true" className="size-4" />
                </Button>
              )}
              <CalendarPeoplePicker
                members={members}
                selected={editor.value.people}
                disabled={disabled}
                onChange={(people) => editor.change({ people }, true)}
              />
              <PopoverRoot
                open={dayOpen}
                onOpenChange={(open) => {
                  if (open) {
                    setDayDraft(editor.value.day);
                    setDayError(undefined);
                    setDayOpen(true);
                  } else {
                    closeDay();
                  }
                }}
              >
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="compact"
                      className="size-7! p-0!"
                      aria-label="Move calendar item"
                      title="Move to another day"
                      disabled={disabled}
                    >
                      <Calendar aria-hidden="true" className="size-4" />
                    </Button>
                  }
                />
                <PopoverPopup
                  aria-label="Move calendar item"
                  className="w-64!"
                  initialFocus={() => dateInput.current}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">
                      Move to another day
                    </span>
                    <Button
                      variant="ghost"
                      size="compact"
                      className="size-7! p-0!"
                      aria-label="Close date picker"
                      onClick={closeDay}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                  <Input
                    ref={dateInput}
                    aria-label="Calendar item day"
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={dayDraft}
                    readOnly={disabled || editor.isSaving}
                    onValueChange={(day) => {
                      setDayDraft(day);
                      setDayError(undefined);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        moveDay();
                      }
                    }}
                  />
                  {(dayError || editor.error) && (
                    <p role="alert" className="mt-2 text-sm text-danger">
                      {dayError || editor.error}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="compact"
                      disabled={disabled || editor.isSaving}
                      onClick={moveDay}
                    >
                      Move
                    </Button>
                  </div>
                </PopoverPopup>
              </PopoverRoot>
              <MenuRoot
                onOpenChange={(open) => {
                  if (open) {
                    skipFocus.current = false;
                  }
                }}
              >
                <MenuTrigger
                  ref={menuInput}
                  render={
                    <Button
                      variant="ghost"
                      size="compact"
                      className="size-7! p-0!"
                      aria-label="Calendar item actions"
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </Button>
                  }
                />
                <MenuPopup
                  align="end"
                  finalFocus={() =>
                    skipFocus.current ? false : menuInput.current
                  }
                >
                  {editor.saved && (
                    <MenuItem
                      variant="danger"
                      disabled={disabled || editor.isSaving}
                      onClick={() => {
                        skipFocus.current = true;
                        setConfirmDelete(true);
                      }}
                    >
                      Delete
                    </MenuItem>
                  )}
                </MenuPopup>
              </MenuRoot>
            </div>
          </div>
          {unavailable && (
            <p role="alert" className="text-sm text-danger">
              This item is no longer available. Any unsaved draft remains here.
            </p>
          )}
          {editor.error && !dayOpen && (
            <p role="alert" className="text-sm text-danger">
              {editor.error}
            </p>
          )}
          <TextDraftActions editor={editor} />
          <span role="status" className="sr-only">
            {editor.isSaving
              ? "Saving"
              : editor.hasChanges
                ? "Unsaved changes"
                : editor.saved
                  ? "Saved"
                  : "New item"}
          </span>
        </div>
      </li>
      <DialogRoot
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!deleting) {
            setConfirmDelete(open);
          }
        }}
      >
        <DialogPopup
          title="Delete calendar item?"
          finalFocus={() =>
            menuInput.current ??
            document.querySelector<HTMLElement>("[data-calendar-add]")
          }
          actions={
            <>
              <Button
                variant="ghost"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!enabled || deleting}
                onClick={() => void remove()}
              >
                Delete item
              </Button>
            </>
          }
        >
          This removes the item for everyone in the household.
          {deleteError && (
            <p role="alert">Unable to delete this item. Try again.</p>
          )}
        </DialogPopup>
      </DialogRoot>
    </>
  );
}
