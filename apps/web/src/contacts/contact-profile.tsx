import {
  type ContactEntryFields,
  type ContactFields,
  contactFieldsSchema,
  detailLabels,
} from "@home-hub/shared/contacts";
import { calendarDate } from "@home-hub/shared/habits";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  InlineAlert,
  Input,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextDraftGuard } from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ContactDetails } from "./contact-details";
import { ContactEntry } from "./contact-entry";
import { ContactMedia } from "./contact-media";
import { EditorStatus } from "./editor-status";
import { writeProfile } from "./mutations";
import { useContactRecord } from "./use-contact-record";

export type ContactRecordControl = { discard: () => void };

export type ContactWork = {
  dirty: boolean;
  saving: boolean;
  focused?: boolean;
};

type Cursor = { entryOn: string; createdAt: number; id: string };

const today = () =>
  calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);

export function ContactProfile({
  householdId,
  contactId,
}: {
  householdId: string;
  contactId: string;
}) {
  const [row, result] = useQuery(
    queries.contacts.detail({ householdId, contactId }),
  );
  const retained = useRef(row);
  if (row) {
    retained.current = row;
  }
  const contact = row ?? retained.current;
  if (!contact) {
    return (
      <p className="text-sm text-muted">
        {result.type === "error"
          ? "Unable to load contact."
          : result.type === "complete"
            ? "Contact unavailable."
            : "Loading contact…"}
      </p>
    );
  }
  const parsed = contactFieldsSchema.safeParse({
    name: contact.name,
    details: contact.details,
    archived: contact.archived ?? false,
  });
  if (!parsed.success) {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to read this contact.
      </InlineAlert>
    );
  }
  return (
    <ProfileContent
      key={householdId + contactId}
      householdId={householdId}
      contactId={contactId}
      current={
        row
          ? { id: row.id, version: row.version ?? 1, fields: parsed.data }
          : result.type === "complete"
            ? null
            : undefined
      }
      initial={parsed.data}
    />
  );
}

function ProfileContent({
  householdId,
  contactId,
  current,
  initial,
}: {
  householdId: string;
  contactId: string;
  current:
    | { id: string; version: number; fields: ContactFields }
    | null
    | undefined;
  initial: ContactFields;
}) {
  const zero = useZero();
  const connected = useZeroMutationEnabled();
  const [settings, settingsResult] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  const enabled =
    connected &&
    settingsResult.type === "complete" &&
    settings.some((s) => s.moduleKey === "contacts" && s.enabled);
  const [search, setSearch] = useState("");
  const [through, setThrough] = useState("");
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [draft, setDraft] = useState<{
    id: string;
    fields: ContactEntryFields;
  }>();
  const [work, setWork] = useState<Record<string, ContactWork>>({});
  const [mediaBusy, setMediaBusy] = useState(false);
  const [profileAction, setProfileAction] = useState(false);
  const [profileActionError, setProfileActionError] = useState<string>();
  const [currentDay, setToday] = useState(today);
  const controls = useRef(new Map<string, ContactRecordControl>());
  const register = useCallback((id: string, control?: ContactRecordControl) => {
    if (control) {
      controls.current.set(id, control);
    } else {
      controls.current.delete(id);
    }
  }, []);
  const pinned = useRef(
    new Map<string, { id: string; fields: ContactEntryFields }>(),
  );
  const liveRows = useRef(new Map<string, ContactEntryFields>());
  const onWork = useCallback((id: string, state: ContactWork) => {
    if (state.dirty || state.saving || state.focused) {
      const fields = liveRows.current.get(id);
      if (fields) {
        pinned.current.set(id, { id, fields });
      }
    } else {
      pinned.current.delete(id);
    }
    setWork((old) => {
      if (
        old[id]?.dirty === state.dirty &&
        old[id]?.saving === state.saving &&
        old[id]?.focused === state.focused
      ) {
        return old;
      }
      return { ...old, [id]: state };
    });
  }, []);
  const localWork = useRef({
    dirty: false,
    saving: false,
    media: false,
    action: false,
  });
  const report = () =>
    onWork("profile", {
      dirty: localWork.current.dirty || localWork.current.media,
      saving:
        localWork.current.saving ||
        localWork.current.media ||
        localWork.current.action,
    });
  const editor = useContactRecord({
    externalSaving: profileAction,
    current,
    initial,
    enabled,
    validate(value: ContactFields) {
      const parsed = contactFieldsSchema.safeParse(value);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const index = issue?.path[0] === "details" ? issue.path[1] : undefined;
        const row =
          typeof index === "number" ? value.details[index] : undefined;
        const message = issue?.message ?? "Complete the details first";

        throw Error(
          row
            ? `${row.label.trim() || detailLabels[row.type]}: ${message}`
            : message,
        );
      }
      return parsed.data;
    },
    save: (fields, base, writeId) => {
      return writeProfile(zero, {
        householdId,
        contactId,
        fields,
        expectedVersion: base?.version ?? null,
        writeId,
      });
    },
    onWork(dirty, saving) {
      localWork.current.dirty = dirty;
      localWork.current.saving = saving;
      report();
    },
  });
  const latest = useRef(editor);
  latest.current = editor;
  useEffect(() => {
    register("profile", { discard: () => latest.current.discard() });
    return () => register("profile");
  }, [register]);
  useEffect(() => {
    const update = () => setToday(today());
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const dirty = Object.values(work).some((s) => s.dirty);
  const saving = Object.values(work).some((s) => s.saving);
  const locked = dirty || saving;
  useBlockAppUpdate(locked);
  const archived = Boolean(current?.fields.archived || editor.value.archived);
  const writable = enabled && !archived && !profileAction;
  const [history, historyResult] = useQuery(
    queries.contacts.history({
      householdId,
      contactId,
      search,
      ...(through ? { through } : {}),
      ...(cursors.at(-1) ? { before: cursors.at(-1) } : {}),
    }),
  );
  const rows = history.slice(0, 20).map((entry) => ({
    id: entry.id,
    fields: {
      entryOn: entry.entryOn,
      note: entry.note ?? "",
      contactIds: entry.people.map((p) => p.contactId).sort(),
    },
  }));
  liveRows.current = new Map(rows.map((r) => [r.id, r.fields]));
  for (const [id, item] of pinned.current) {
    if (id !== "profile" && !rows.some((r) => r.id === id)) {
      rows.push(item);
    }
  }
  if (draft && !rows.some((r) => r.id === draft.id)) {
    rows.unshift(draft);
  }
  return (
    <section className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-5">
      <ContactMedia
        kind="profile"
        householdId={householdId}
        itemId={contactId}
        name={editor.value.name}
        saved={Boolean(editor.base)}
        disabled={!writable}
        prepare={() => editor.flush()}
        onBusyChange={(busy) => {
          setMediaBusy(busy);
          localWork.current.media = busy;
          report();
        }}
      >
        {({ upload, gallery }) => (
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                appearance="seamless"
                aria-label="Contact name"
                maxLength={150}
                className="h-9! min-w-0 flex-1 text-xl font-semibold"
                disabled={!writable || mediaBusy}
                value={editor.value.name}
                onValueChange={(name) =>
                  editor.change({ ...editor.value, name })
                }
                onBlur={() => void editor.flush()}
              />
              {upload}
              <ConfirmationPopover
                confirmLabel={archived ? "Restore" : "Archive"}
                message={
                  archived
                    ? "Restore this contact to the active list?"
                    : "Archive this contact? Its profile, pictures and shared entries are retained."
                }
                trigger={
                  <Button
                    size="compact"
                    variant="ghost"
                    disabled={
                      !enabled || profileAction || (archived ? saving : locked)
                    }
                  >
                    {archived ? "Restore" : "Archive"}
                  </Button>
                }
                onConfirm={() => {
                  void (async () => {
                    if (
                      !enabled ||
                      profileAction ||
                      !editor.base ||
                      (archived ? saving : locked)
                    ) {
                      return;
                    }
                    const base = archived
                      ? (current ?? editor.base)
                      : editor.base;
                    setProfileAction(true);
                    setProfileActionError(undefined);
                    localWork.current.action = true;
                    report();
                    try {
                      const record = await writeProfile(zero, {
                        householdId,
                        contactId,
                        expectedVersion: base.version,
                        writeId: crypto.randomUUID(),
                        fields: { ...base.fields, archived: !archived },
                      });
                      if (editor.hasChanges) {
                        editor.reconcile(record);
                      } else {
                        editor.accept(record);
                      }
                    } catch {
                      setProfileActionError(
                        "Unable to change archive status. Review the saved profile and retry.",
                      );
                    } finally {
                      setProfileAction(false);
                      localWork.current.action = false;
                      report();
                    }
                  })();
                }}
              />
            </div>
            {gallery}
          </div>
        )}
      </ContactMedia>
      {archived ? (
        <p className="text-sm text-muted">
          Archived. Restore this contact before editing or adding entries.
        </p>
      ) : null}
      <ContactDetails
        rows={editor.value.details}
        disabled={!writable || mediaBusy}
        change={(details) => editor.change({ ...editor.value, details })}
      />
      <EditorStatus editor={editor} />
      {profileActionError ? (
        <InlineAlert role="alert" variant="danger">
          {profileActionError}
        </InlineAlert>
      ) : null}
      {locked ? (
        <TextDraftGuard
          editor={{
            get hasChanges() {
              return Object.values(work).some((s) => s.dirty || s.saving);
            },
            isSaving: saving,
            error: undefined,
            retry: () => {},
            discard: () => {
              for (const control of controls.current.values()) {
                control.discard();
              }
            },
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Input
          aria-label="Search contact notes"
          placeholder="Search this contact’s notes"
          value={search}
          maxLength={200}
          disabled={locked}
          className="min-w-0 flex-1"
          onValueChange={(value) => {
            setSearch(value);
            setCursors([]);
            setDraft(undefined);
          }}
        />
        <Input
          type="date"
          aria-label="Notes through date"
          className="w-auto! flex-none!"
          value={through}
          disabled={locked}
          onChange={(e) => {
            setThrough(e.target.value);
            setCursors([]);
            setDraft(undefined);
          }}
        />
        {through ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => {
              setThrough("");
              setCursors([]);
            }}
          >
            All dates
          </Button>
        ) : null}
        <Button
          size="compact"
          variant="ghost"
          disabled={
            !writable ||
            locked ||
            Boolean(draft && !history.some((r) => r.id === draft.id))
          }
          onClick={() =>
            setDraft({
              id: crypto.randomUUID(),
              fields: { entryOn: today(), note: "", contactIds: [contactId] },
            })
          }
        >
          Add entry
        </Button>
      </div>
      {historyResult.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load entries.
        </InlineAlert>
      ) : null}
      <div className="grid min-w-0">
        {rows.map((row) => (
          <ContactEntry
            key={row.id}
            householdId={householdId}
            contactId={contactId}
            entryId={row.id}
            initial={row.fields}
            enabled={writable}
            today={currentDay}
            register={register}
            onWork={onWork}
            onRemoved={(id) => {
              pinned.current.delete(id);
              setDraft((old) => (old?.id === id ? undefined : old));
            }}
          />
        ))}
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted">
          {historyResult.type === "complete"
            ? "No entries."
            : "Loading entries…"}
        </p>
      ) : null}
      <div className="flex gap-2">
        {cursors.length ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => setCursors((s) => s.slice(0, -1))}
          >
            Newer entries
          </Button>
        ) : null}
        {history.length > 20 ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => {
              const last = history[19];
              if (last) {
                setCursors((s) => [
                  ...s,
                  {
                    entryOn: last.entryOn,
                    createdAt: last.createdAt ?? 0,
                    id: last.id,
                  },
                ]);
                setDraft(undefined);
              }
            }}
          >
            Older entries
          </Button>
        ) : null}
      </div>
    </section>
  );
}
