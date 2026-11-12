import { calendarChanges } from "@home-hub/shared/calendar";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  Calendar,
  Check,
  DialogPopup,
  DialogRoot,
  GripVertical,
  IconButton,
  Input,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
  StickyNote,
  Textarea,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import {
  type CalendarDraft,
  type CalendarSaveResult,
  useCalendarEditor,
} from "./use-calendar-editor";

export type CalendarRowControl = { flush: () => Promise<boolean> };
export type CalendarFocus = "title" | "note";
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
  onClose,
  onFollow,
  controls,
  focus = "title",
}: {
  householdId: string;
  itemId: string;
  initialValue: CalendarDraft;
  existing: boolean;
  enabled: boolean;
  members: readonly Member[];
  onClose: () => void;
  onFollow: (day: string) => void;
  controls: Ref<CalendarRowControl>;
  focus?: CalendarFocus;
}) {
  const [row, result] = useQuery(
    queries.calendar.item({ householdId, itemId }),
  );
  const loaded = result.type === "complete" || !existing;
  const zero = useZero();
  const titleInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const peopleInput = useRef<HTMLFieldSetElement>(null);
  const menuInput = useRef<HTMLButtonElement>(null);
  const skipFocus = useRef(false);
  const [noteOpen, setNoteOpen] = useState(
    focus === "note" || Boolean(initialValue.note),
  );
  const [panel, setPanel] = useState<"day" | "people">();
  useEffect(() => {
    (focus === "note" ? noteInput.current : titleInput.current)?.focus();
  }, [focus]);
  useEffect(() => {
    if (panel === "day") {
      dateInput.current?.focus();
    }
    if (panel === "people") {
      peopleInput.current?.querySelector("button")?.focus();
    }
  }, [panel]);
  const toDraft = (r: Row): CalendarDraft => ({
    title: r.title,
    note: r.note ?? "",
    day: r.day,
    people: r.people.map((p) => p.userId).sort(),
  });
  const [initial] = useState(initialValue);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBlockAppUpdate(deleting || confirmDelete);
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
      try {
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
          onFollow(next.day);
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
              onFollow(next.day);
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
      }
    },
  });
  const unavailable = editor.saved && result.type === "complete" && !row;
  const disabled = !enabled || !loaded || unavailable || deleting;
  async function close() {
    if (!deleting && (await editor.flush())) {
      onClose();
      requestAnimationFrame(() =>
        (
          document.querySelector<HTMLElement>(
            `[data-calendar-open="${itemId}"]`,
          ) ?? document.querySelector<HTMLElement>("[data-calendar-add]")
        )?.focus(),
      );
    }
  }
  async function remove() {
    setDeleting(true);
    setDeleteError(false);
    try {
      const outcome = await acknowledgeMutation(
        zero.mutate(mutators.calendar.delete(base())),
      );
      if (outcome.type === "error") {
        throw Error("Delete failed");
      }
      onClose();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  }

  useImperativeHandle(controls, () => ({ flush: editor.flush }), [
    editor.flush,
  ]);
  const names = members
    .filter((m) => editor.value.people.includes(m.userId))
    .map((m) => m.user?.username ?? "Member")
    .join(", ");
  return (
    <>
      <li
        data-calendar-editing={itemId}
        className="flex min-w-0 items-start gap-2 py-3"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center"
        >
          <GripVertical className="size-4 text-subtle" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <Input
              ref={titleInput}
              appearance="seamless"
              aria-label="Calendar item name"
              placeholder="Item name"
              className="h-8! min-w-0 w-full px-0! text-sm font-medium"
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
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  void close();
                }
              }}
            />
            <IconButton
              aria-label="Edit calendar note"
              title="Note"
              onClick={() => {
                setNoteOpen(true);
                requestAnimationFrame(() => noteInput.current?.focus());
              }}
            >
              <StickyNote className="size-4" />
            </IconButton>
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
                  <IconButton aria-label="Calendar item actions">
                    <MoreHorizontal className="size-4" />
                  </IconButton>
                }
              />
              <MenuPopup
                align="end"
                finalFocus={() =>
                  skipFocus.current ? false : menuInput.current
                }
              >
                <MenuItem
                  disabled={disabled}
                  onClick={() => {
                    skipFocus.current = true;
                    setPanel("day");
                  }}
                >
                  Move to another day
                </MenuItem>
                <MenuItem
                  disabled={disabled}
                  onClick={() => {
                    skipFocus.current = true;
                    setPanel("people");
                  }}
                >
                  People
                </MenuItem>
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
            <IconButton
              aria-label="Done editing calendar item"
              title="Done"
              disabled={deleting}
              onClick={() => void close()}
            >
              <Check className="size-4" />
            </IconButton>
          </div>
          {names && panel !== "people" && (
            <p className="mt-1 text-xs text-muted">{names}</p>
          )}
          {(noteOpen || editor.value.note) && (
            <Textarea
              ref={noteInput}
              appearance="seamless"
              aria-label="Calendar item note"
              placeholder="Note"
              className="mt-1 w-full min-h-8! px-0! text-xs text-muted"
              rows={1}
              maxLength={10000}
              value={editor.value.note}
              readOnly={disabled}
              onChange={(event) => editor.change({ note: event.target.value })}
            />
          )}
          {panel === "day" && (
            <div className="mt-2 flex items-center gap-2">
              <Calendar aria-hidden="true" className="size-4 text-muted" />
              <Input
                ref={dateInput}
                appearance="seamless"
                aria-label="Calendar item day"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={editor.value.day}
                readOnly={disabled}
                onValueChange={(day) => editor.change({ day }, true)}
              />
            </div>
          )}
          {panel === "people" && (
            <fieldset
              ref={peopleInput}
              aria-label="Calendar item people"
              className="mt-2 flex flex-wrap gap-1"
            >
              {members.map((member) => (
                <Button
                  key={member.userId}
                  size="compact"
                  variant={
                    editor.value.people.includes(member.userId)
                      ? "secondary"
                      : "ghost"
                  }
                  aria-pressed={editor.value.people.includes(member.userId)}
                  disabled={disabled}
                  onClick={() =>
                    editor.change(
                      {
                        people: (editor.value.people.includes(member.userId)
                          ? editor.value.people.filter(
                              (p) => p !== member.userId,
                            )
                          : [...editor.value.people, member.userId]
                        ).sort(),
                      },
                      true,
                    )
                  }
                >
                  {member.user?.username ?? "Member"}
                </Button>
              ))}
            </fieldset>
          )}
          {unavailable && (
            <p role="alert" className="text-sm text-danger">
              This item is no longer available. Any unsaved draft remains here.
            </p>
          )}
          {editor.error && (
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
      <TextDraftGuard
        editor={{
          ...editor,
          isSaving: editor.isSaving || deleting,
          hasChanges: editor.hasChanges || deleting,
        }}
      />
    </>
  );
}
