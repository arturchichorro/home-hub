import { calendarDate } from "@home-hub/shared/habits";
import type { LogEntrySnapshot } from "@home-hub/shared/logs";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { LogEntry, User } from "@home-hub/shared/zero/schema";
import {
  Button,
  DialogPopup,
  DialogRoot,
  Folder,
  IconButton,
  InlineAlert,
  Input,
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
import type { MediaSession } from "../media/session";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { LogConflict, writeLogEntry } from "./api";
import { categoryColors, LogCategoryChooser } from "./log-category";
import { LogEntryEditor } from "./log-entry-editor";

type Entry = LogEntry & { creator: User | undefined; editor: User | undefined };
const snapshot = (e: Entry | undefined): LogEntrySnapshot | null =>
  e
    ? {
        id: e.id,
        entryOn: e.entryOn,
        note: e.note,
        version: e.version ?? 1,
        createdBy: e.createdBy,
        lastEditedBy: e.lastEditedBy,
        createdAt: e.createdAt ?? 0,
        updatedAt: e.updatedAt ?? 0,
      }
    : null;
const today = () =>
  calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
const label = (date: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${date}T12:00:00`),
  );
export function LogDetail({
  householdId,
  logId,
  session,
}: {
  householdId: string;
  logId: string;
  session: MediaSession;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled(),
    navigate = useNavigate();
  const [currentDay, setToday] = useState(today),
    [selectedDay, setSelectedDay] = useState(today),
    [search, setSearch] = useState(""),
    [cursors, setCursors] = useState<string[]>([]),
    [work, setWork] = useState<Record<string, boolean>>({}),
    [categoryOpen, setCategoryOpen] = useState(false),
    [removeLog, setRemoveLog] = useState(false),
    [removeEntry, setRemoveEntry] = useState<{
      entry: Entry;
      writeId: string;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [conflict, setConflict] = useState(false);
  const [log, logResult] = useQuery(
      queries.logs.detail({ householdId, logId }),
    ),
    [categories] = useQuery(queries.logs.categories({ householdId })),
    [selected, selectedResult] = useQuery(
      queries.logs.entry({ householdId, logId, entryOn: selectedDay }),
    ),
    [history, historyResult] = useQuery(
      queries.logs.history({
        householdId,
        logId,
        search,
        ...(cursors.at(-1) ? { before: cursors.at(-1) } : {}),
      }),
    );
  const snapshots = useRef(new Map<string, Entry>()),
    live = useRef<{ history: readonly Entry[]; selected: Entry | undefined }>({
      history,
      selected,
    });
  live.current = { history, selected };
  const onWork = useCallback((date: string, active: boolean) => {
    if (active) {
      const entry =
        live.current.selected?.entryOn === date
          ? live.current.selected
          : live.current.history.find((e) => e.entryOn === date);
      if (entry) snapshots.current.set(date, entry);
    } else snapshots.current.delete(date);
    setWork((prev) => {
      if (!!prev[date] === active) return prev;
      const next = { ...prev };
      if (active) next[date] = true;
      else delete next[date];
      return next;
    });
  }, []);
  const locked = Object.values(work).some(Boolean) || busy;
  const rows = history.slice(0, 20).filter((e) => e.entryOn !== selectedDay);
  for (const [date, active] of Object.entries(work)) {
    if (!active || date === selectedDay || rows.some((e) => e.entryOn === date))
      continue;
    const pinned = snapshots.current.get(date);
    if (pinned) rows.push(pinned);
  }
  rows.sort((a, b) => b.entryOn.localeCompare(a.entryOn));
  const selectedEntry =
    selected ??
    (work[selectedDay] ? snapshots.current.get(selectedDay) : undefined);
  useEffect(() => {
    const update = () => setToday(today());
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const header = useMemo(
    () => (
      <div className="flex gap-1">
        <IconButton
          aria-label="Change log category"
          className="size-7!"
          disabled={!enabled || locked}
          onClick={() => setCategoryOpen(true)}
        >
          <Folder aria-hidden="true" className="size-4" />
        </IconButton>
        <MenuRoot>
          <MenuTrigger
            render={
              <IconButton aria-label="Log actions" className="size-7!">
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </IconButton>
            }
          />
          <MenuPopup align="end">
            <MenuItem
              variant="danger"
              disabled={!enabled || locked}
              onClick={() => setRemoveLog(true)}
            >
              Remove log
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
      </div>
    ),
    [enabled, locked],
  );
  useAppHeaderRightComponent(header);
  async function deleteLog() {
    if (!enabled || locked) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acknowledgeMutation(
        zero.mutate(mutators.logs.delete({ householdId, logId })),
      );
      if (r.type !== "success") throw Error();
      setRemoveLog(false);
      await navigate({
        to: "/households/$householdId/logs",
        params: { householdId },
      });
    } catch {
      setError("Unable to remove this log.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteEntry() {
    if (!removeEntry || !enabled || locked || conflict) return;
    setBusy(true);
    setError(undefined);
    try {
      await writeLogEntry(session, {
        householdId,
        logId,
        entryOn: removeEntry.entry.entryOn,
        entryId: removeEntry.entry.id,
        expectedVersion: removeEntry.entry.version ?? 1,
        writeId: removeEntry.writeId,
        note: "",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setRemoveEntry(undefined);
    } catch (e) {
      setError(
        e instanceof LogConflict
          ? "This entry changed elsewhere. Close this dialog and review the latest note before removing it."
          : "Unable to remove this entry. Please retry.",
      );
      setConflict(e instanceof LogConflict);
    } finally {
      setBusy(false);
    }
  }
  if (logResult.type === "error")
    return (
      <InlineAlert variant="danger" role="alert">
        Unable to load this log.
      </InlineAlert>
    );
  if (!log)
    return (
      <p className="text-sm text-muted">
        {logResult.type === "complete"
          ? "This log is no longer available."
          : "Loading log…"}
      </p>
    );
  function entryHeader(entry: Entry) {
    return (
      <header className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-sm font-medium"
          disabled={locked}
          onClick={() => setSelectedDay(entry.entryOn)}
        >
          {label(entry.entryOn)}
        </button>
        <MenuRoot>
          <MenuTrigger
            render={
              <IconButton
                aria-label={`Entry actions for ${entry.entryOn}`}
                className="size-7!"
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </IconButton>
            }
          />
          <MenuPopup align="end">
            <MenuItem
              variant="danger"
              disabled={!enabled || locked}
              onClick={() => {
                setError(undefined);
                setConflict(false);
                setRemoveEntry({ entry, writeId: crypto.randomUUID() });
              }}
            >
              Remove entry
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
      </header>
    );
  }
  function attribution(entry: Entry | undefined) {
    return entry ? (
      <p
        className="mt-2 text-xs text-muted"
        title={`Created by ${entry.creator?.username ?? "a household member"} on ${new Date(entry.createdAt ?? 0).toLocaleString()}; last edited ${new Date(entry.updatedAt ?? 0).toLocaleString()}`}
      >
        Edited by {entry.editor?.username ?? "a household member"} ·{" "}
        {new Date(entry.updatedAt ?? 0).toLocaleString()}
      </p>
    ) : null;
  }
  return (
    <section aria-label="Log entries" className="grid min-w-0 gap-5">
      {log.category ? (
        <span
          className={`w-fit rounded-sm px-2 py-1 text-xs ${categoryColors[log.category.color]}`}
        >
          {log.category.name}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label="Entry date"
          value={selectedDay}
          max={currentDay}
          disabled={locked}
          className="w-auto!"
          onChange={(e) => {
            if (e.target.value) setSelectedDay(e.target.value);
          }}
        />
        {selectedDay !== currentDay ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => setSelectedDay(currentDay)}
          >
            Today
          </Button>
        ) : null}
      </div>
      <section
        aria-label={`Selected entry ${selectedDay}`}
        className="border-b border-border pb-5"
      >
        <h2 className="mb-2 text-sm font-medium">
          {selectedDay === currentDay ? "Today" : label(selectedDay)}
        </h2>
        {selectedResult.type === "complete" || work[selectedDay] ? (
          <LogEntryEditor
            key={selectedDay}
            householdId={householdId}
            logId={logId}
            entryOn={selectedDay}
            entry={snapshot(selectedEntry)}
            future={selectedDay > currentDay}
            session={session}
            onWork={onWork}
          />
        ) : (
          <p className="text-sm text-muted">
            {selectedResult.type === "error"
              ? "Unable to load this entry."
              : "Loading entry…"}
          </p>
        )}
        {attribution(selectedEntry)}
      </section>
      <Input
        aria-label="Search notes"
        placeholder="Search this log’s notes"
        maxLength={200}
        value={search}
        disabled={locked}
        onChange={(e) => {
          setSearch(e.target.value);
          setCursors([]);
        }}
      />
      {historyResult.type === "error" ? (
        <InlineAlert variant="danger" role="alert">
          Unable to load note history.
        </InlineAlert>
      ) : null}
      <div className="grid min-w-0 gap-5">
        {rows.map((entry) => (
          <section
            key={entry.entryOn}
            aria-label={`Entry ${entry.entryOn}`}
            className="border-b border-border pb-5"
          >
            {entryHeader(entry)}
            <LogEntryEditor
              householdId={householdId}
              logId={logId}
              entryOn={entry.entryOn}
              entry={snapshot(entry)}
              session={session}
              onWork={onWork}
            />
            {attribution(entry)}
          </section>
        ))}
      </div>
      {!rows.length && historyResult.type === "complete" ? (
        <p className="text-sm text-muted">
          {search ? "No matching older notes." : "No other entries yet."}
        </p>
      ) : null}
      <div className="flex gap-2">
        {cursors.length ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => setCursors((stack) => stack.slice(0, -1))}
          >
            Newer notes
          </Button>
        ) : null}
        {history.length > 20 ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={locked}
            onClick={() => {
              const last = history[19];
              if (last) setCursors((stack) => [...stack, last.entryOn]);
            }}
          >
            Older notes
          </Button>
        ) : null}
      </div>
      {error && !removeEntry && !removeLog ? (
        <InlineAlert variant="danger" role="alert">
          {error}
        </InlineAlert>
      ) : null}
      {categoryOpen ? (
        <LogCategoryChooser
          householdId={householdId}
          logId={logId}
          current={log.category?.id ?? null}
          categories={categories}
          onClose={() => setCategoryOpen(false)}
        />
      ) : null}
      <DialogRoot
        open={removeLog || !!removeEntry}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRemoveLog(false);
            setRemoveEntry(undefined);
            setError(undefined);
            setConflict(false);
          }
        }}
      >
        <DialogPopup
          title={removeLog ? "Remove log?" : "Remove entry?"}
          actions={
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRemoveLog(false);
                  setRemoveEntry(undefined);
                  setError(undefined);
                  setConflict(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!enabled || locked || conflict}
                onClick={() => void (removeLog ? deleteLog() : deleteEntry())}
              >
                Remove
              </Button>
            </>
          }
        >
          The record will be retained but hidden. There is no restore interface.
          {error ? (
            <InlineAlert variant="danger" role="alert">
              {error}
            </InlineAlert>
          ) : null}
        </DialogPopup>
      </DialogRoot>
    </section>
  );
}
