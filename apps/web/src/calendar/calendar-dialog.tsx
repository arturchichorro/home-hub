import { calendarChanges } from "@home-hub/shared/calendar";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  DialogPopup,
  DialogRoot,
  Input,
  Textarea,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useId, useRef, useState } from "react";
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

type Member = { userId: string; user?: { username: string } | undefined };

export function CalendarDialog({
  householdId,
  itemId,
  initial,
  existing,
  enabled,
  members,
  onClose,
  onFollow,
}: {
  householdId: string;
  itemId: string;
  initial: CalendarDraft;
  existing: boolean;
  enabled: boolean;
  members: readonly Member[];
  onClose: () => void;
  onFollow: (day: string) => void;
}) {
  const [row, result] = useQuery(
    queries.calendar.item({ householdId, itemId }),
  );
  return (
    <CalendarDialogContent
      householdId={householdId}
      itemId={itemId}
      initialValue={initial}
      existing={existing}
      enabled={enabled}
      members={members}
      onClose={onClose}
      onFollow={onFollow}
      row={row}
      loaded={result.type === "complete"}
    />
  );
}

type Row = {
  title: string;
  note: string | null;
  day: string;
  people: readonly { userId: string }[];
};
function CalendarDialogContent({
  householdId,
  itemId,
  initialValue,
  existing,
  enabled,
  members,
  onClose,
  onFollow,
  row,
  loaded,
}: {
  householdId: string;
  itemId: string;
  initialValue: CalendarDraft;
  existing: boolean;
  enabled: boolean;
  members: readonly Member[];
  onClose: () => void;
  onFollow: (day: string) => void;
  row: Row | undefined;
  loaded: boolean;
}) {
  const zero = useZero();
  const id = useId();
  const titleInput = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (loaded && enabled && !focused.current) {
      titleInput.current?.focus();
      focused.current = true;
    }
  }, [loaded, enabled]);
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
  const unavailable = editor.saved && loaded && !row;
  const disabled = !enabled || !loaded || unavailable || deleting;
  async function close() {
    if (!deleting && (await editor.flush())) {
      onClose();
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
  return (
    <>
      <DialogRoot
        open
        onOpenChange={(open) => {
          if (!open) {
            void close();
          }
        }}
      >
        <DialogPopup
          title="Calendar item"
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          finalFocus={() =>
            document.querySelector<HTMLElement>(
              `[data-calendar-open="${itemId}"]`,
            ) ??
            document.querySelector<HTMLElement>(
              `[data-calendar-day="${editor.value.day}"]`,
            ) ??
            document.querySelector<HTMLElement>("[data-calendar-add]")
          }
          actions={
            <>
              {editor.saved && (
                <Button
                  variant="ghost"
                  disabled={disabled || editor.isSaving}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
              <Button disabled={deleting} onClick={() => void close()}>
                Close
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <div>
              <label
                className="block text-xs text-muted"
                htmlFor={`${id}-title`}
              >
                Title
              </label>
              <Input
                ref={titleInput}
                id={`${id}-title`}
                appearance="seamless"
                className="w-full"
                autoFocus
                value={editor.value.title}
                maxLength={150}
                required
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void editor.flush();
                  }
                }}
                readOnly={disabled}
                disabled={deleting}
                onValueChange={(title) => editor.change({ title })}
                onBlur={() => {
                  if (!editor.error && editor.value.title.trim()) {
                    void editor.flush();
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor={`${id}-day`}>
                Day
              </label>
              <Input
                id={`${id}-day`}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={editor.value.day}
                readOnly={disabled}
                disabled={deleting}
                onValueChange={(nextDay) =>
                  editor.change({ day: nextDay }, true)
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor={`${id}-note`}>
                Note
              </label>
              <Textarea
                id={`${id}-note`}
                value={editor.value.note}
                maxLength={10000}
                readOnly={disabled}
                disabled={deleting}
                rows={4}
                onChange={(event) =>
                  editor.change({ note: event.target.value })
                }
              />
            </div>
            <fieldset disabled={disabled} className="grid gap-2">
              <legend className="mb-2 text-xs text-muted">People</legend>
              {members.map((member) => (
                <label
                  key={member.userId}
                  className="flex min-h-9 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={editor.value.people.includes(member.userId)}
                    onChange={(event) =>
                      editor.change(
                        {
                          people: (event.target.checked
                            ? [...editor.value.people, member.userId]
                            : editor.value.people.filter(
                                (p) => p !== member.userId,
                              )
                          ).sort(),
                        },
                        true,
                      )
                    }
                  />
                  {member.user?.username ?? "Member"}
                </label>
              ))}
            </fieldset>
            {unavailable && (
              <p role="alert" className="text-sm text-danger">
                This item is no longer available. Any unsaved draft remains
                here.
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
        </DialogPopup>
      </DialogRoot>
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
