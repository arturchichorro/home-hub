import {
  type ContactEntryFields,
  type ContactEntrySnapshot,
  entryFieldsSchema,
} from "@home-hub/shared/contacts";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  IconButton,
  Input,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ContactMedia } from "./contact-media";
import type { ContactRecordControl, ContactWork } from "./contact-profile";
import { EditorStatus } from "./editor-status";
import { writeEntry } from "./mutations";
import { useContactRecord } from "./use-contact-record";

export function ContactEntry({
  householdId,
  contactId,
  entryId,
  initial,
  enabled,
  today,
  register,
  onWork,
  onRemoved,
}: {
  householdId: string;
  contactId: string;
  entryId: string;
  initial: ContactEntryFields;
  enabled: boolean;
  today: string;
  register: (id: string, control?: ContactRecordControl) => void;
  onWork: (id: string, work: ContactWork) => void;
  onRemoved: (id: string) => void;
}) {
  const zero = useZero();
  const [row, result] = useQuery(
    queries.contacts.entry({ householdId, entryId }),
  );
  const [search, setSearch] = useState("");
  const [choices] = useQuery(
    queries.contacts.index({ householdId, search, limit: 101 }),
  );
  const [mediaBusy, setMediaBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const work = useRef({
    focused: false,
    dialog: false,
    media: false,
    action: false,
    dirty: false,
    saving: false,
  });
  const snapshot: ContactEntrySnapshot | null | undefined = row
    ? {
        id: row.id,
        version: row.version ?? 1,
        fields: {
          entryOn: row.entryOn,
          note: row.note ?? "",
          contactIds: row.people.map((p) => p.contactId).sort(),
        },
      }
    : result.type === "complete"
      ? null
      : undefined;
  const report = () =>
    onWork(entryId, {
      focused: work.current.focused || work.current.dialog,
      dirty: work.current.dirty || work.current.media,
      saving: work.current.saving || work.current.media || work.current.action,
    });
  const editor = useContactRecord({
    externalSaving: actionBusy,
    current: snapshot,
    initial,
    enabled,
    validate(value: ContactEntryFields) {
      const parsed = entryFieldsSchema.safeParse(value);
      if (!parsed.success) {
        throw Error(parsed.error.issues[0]?.message ?? "Check the entry");
      }
      return parsed.data;
    },
    save: (fields, base, writeId, prepare) => {
      return writeEntry(zero, {
        householdId,
        entryId,
        fields,
        expectedVersion: base?.version ?? null,
        writeId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        action: prepare && !fields.note.trim() ? "prepare-photo" : "save",
      });
    },
    onWork(dirty, saving) {
      work.current.dirty = dirty;
      work.current.saving = saving;
      report();
    },
  });
  const latest = useRef(editor);
  latest.current = editor;
  useEffect(() => {
    register(entryId, { discard: () => latest.current.discard() });
    return () => {
      register(entryId);
      onWork(entryId, { dirty: false, saving: false });
    };
  }, [entryId, register, onWork]);
  const value = editor.value;
  const labels = new Map(
    row?.people.flatMap((p) =>
      p.contact ? [[p.contactId, p.contact] as const] : [],
    ) ?? [],
  );
  async function remove(unlink: boolean) {
    if (
      !enabled ||
      !editor.base ||
      editor.isSaving ||
      mediaBusy ||
      actionBusy
    ) {
      return;
    }
    setActionBusy(true);
    work.current.action = true;
    report();
    setActionError(undefined);
    try {
      const base = editor.base;
      const record = await writeEntry(zero, {
        householdId,
        entryId,
        fields: unlink
          ? {
              ...base.fields,
              contactIds: base.fields.contactIds.filter(
                (id) => id !== contactId,
              ),
            }
          : base.fields,
        expectedVersion: base.version,
        writeId: crypto.randomUUID(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        action: unlink ? "save" : "delete",
      });
      editor.accept(record);
      setRemoved(true);
      onRemoved(entryId);
    } catch {
      setActionError(
        "This entry could not be changed. Review the latest version and retry.",
      );
    } finally {
      setActionBusy(false);
      work.current.action = false;
      report();
    }
  }
  if (removed) {
    return null;
  }
  return (
    <article
      data-contact-entry={entryId}
      onFocusCapture={() => {
        work.current.focused = true;
        report();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          work.current.focused = false;
          report();
        }
      }}
      className="grid min-w-0 grid-cols-1 gap-2 border-b border-border py-4"
    >
      <ContactMedia
        kind="entry"
        householdId={householdId}
        itemId={entryId}
        name="contact entry"
        saved={Boolean(editor.base)}
        disabled={!enabled || actionBusy}
        prepare={() => editor.flush(true)}
        onBusyChange={(busy) => {
          setMediaBusy(busy);
          work.current.media = busy;
          report();
        }}
      >
        {({ upload, gallery }) => (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                aria-label="Entry date"
                className="h-7! w-auto! flex-none!"
                max={
                  editor.base && editor.base.fields.entryOn > today
                    ? editor.base.fields.entryOn
                    : today
                }
                disabled={!enabled || mediaBusy || actionBusy}
                value={value.entryOn}
                onChange={(e) =>
                  editor.change({ ...value, entryOn: e.target.value })
                }
                onBlur={() => void editor.flush()}
              />
              {upload}
              {!editor.base ? (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={mediaBusy || actionBusy || editor.isSaving}
                  onClick={() => {
                    editor.discard();
                    onRemoved(entryId);
                  }}
                >
                  Discard new entry
                </Button>
              ) : null}
              {editor.base ? (
                <>
                  {editor.base.fields.contactIds.length > 1 ? (
                    <ConfirmationPopover
                      confirmLabel="Unlink"
                      onOpenChange={(open) => {
                        work.current.dialog = open;
                        report();
                      }}
                      message="Remove this contact from the shared entry? Its text and pictures remain on the other contacts."
                      trigger={
                        <Button
                          size="compact"
                          variant="ghost"
                          disabled={
                            !enabled ||
                            editor.hasChanges ||
                            mediaBusy ||
                            actionBusy
                          }
                        >
                          Unlink
                        </Button>
                      }
                      onConfirm={() => void remove(true)}
                    />
                  ) : null}
                  <ConfirmationPopover
                    onOpenChange={(open) => {
                      work.current.dialog = open;
                      report();
                    }}
                    message={
                      "Delete this entry and its pictures from all " +
                      editor.base.fields.contactIds.length +
                      " linked contact profiles? Unsaved edits will also be discarded."
                    }
                    trigger={
                      <IconButton
                        className="size-7! shrink-0"
                        aria-label="Delete entry everywhere"
                        title="Delete entry everywhere"
                        disabled={
                          !enabled || mediaBusy || actionBusy || editor.isSaving
                        }
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </IconButton>
                    }
                    onConfirm={() => void remove(false)}
                  />
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              {value.contactIds.map((id) => (
                <span key={id} className="flex min-w-0 items-center gap-1">
                  <Link
                    className="max-w-40 truncate text-muted underline"
                    to="/households/$householdId/contacts/$contactId"
                    params={{ householdId, contactId: id }}
                  >
                    {labels.get(id)?.name ??
                      (id === contactId
                        ? "This contact"
                        : (choices.find((p) => p.id === id)?.name ??
                          "Linked contact"))}
                    {labels.get(id)?.archived ? " (archived)" : ""}
                  </Link>
                  <button
                    type="button"
                    aria-label={"Remove person " + (labels.get(id)?.name ?? id)}
                    disabled={
                      !enabled ||
                      mediaBusy ||
                      actionBusy ||
                      value.contactIds.length <= 1
                    }
                    onClick={() =>
                      editor.change({
                        ...value,
                        contactIds: value.contactIds.filter((p) => p !== id),
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <details>
              <summary className="w-fit cursor-pointer text-xs text-muted">
                People
              </summary>
              <Input
                aria-label="Find people for entry"
                placeholder="Search contacts"
                maxLength={200}
                value={search}
                onValueChange={setSearch}
                className="mt-2 h-8!"
              />
              <fieldset
                className="mt-2 flex max-h-40 flex-wrap gap-3 overflow-y-auto"
                disabled={!enabled || mediaBusy || actionBusy}
              >
                <legend className="sr-only">People on this entry</legend>
                {choices.slice(0, 100).map((person) => (
                  <label
                    key={person.id}
                    className="flex min-w-0 items-center gap-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={value.contactIds.includes(person.id)}
                      disabled={
                        value.contactIds.length === 1 &&
                        value.contactIds[0] === person.id
                      }
                      onChange={(e) =>
                        editor.change({
                          ...value,
                          contactIds: e.target.checked
                            ? [...value.contactIds, person.id]
                            : value.contactIds.filter((id) => id !== person.id),
                        })
                      }
                    />
                    <span className="max-w-48 truncate">{person.name}</span>
                  </label>
                ))}
              </fieldset>
              {choices.length > 100 ? (
                <p className="text-xs text-muted">
                  Refine the search to find more people.
                </p>
              ) : null}
            </details>
            <Textarea
              appearance="seamless"
              aria-label="Entry note"
              placeholder="Add a note or picture…"
              rows={2}
              maxLength={20000}
              className="min-w-0"
              disabled={!enabled || mediaBusy || actionBusy}
              value={value.note}
              onChange={(e) =>
                editor.change({ ...value, note: e.target.value })
              }
              onBlur={() => {
                if (value.note.trim() || editor.base) {
                  void editor.flush();
                }
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void editor.flush();
                }
              }}
            />
            {gallery}
          </>
        )}
      </ContactMedia>
      <EditorStatus
        editor={editor}
        getPersonName={(id) => labels.get(id)?.name}
      />
      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}
    </article>
  );
}
