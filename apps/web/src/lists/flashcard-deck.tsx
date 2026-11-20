import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  flashcardFieldsSchema,
  practiceSnapshot,
} from "@home-hub/shared/flashcards";
import { listNameSchema } from "@home-hub/shared/lists";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { List } from "@home-hub/shared/zero/schema";
import {
  Button,
  ConfirmationPopover,
  Input,
  Play,
  Plus,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useTextRecordEditor } from "../editing/use-text-record-editor";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { type FlashcardControl, FlashcardRow } from "./flashcard-row";
import { FlashcardStudy, type PracticeCard } from "./flashcard-study";
import { listOrderingSensors } from "./list-card";

type Entry = { id: string; front: string; back: string; persisted: boolean };

export function FlashcardDeck({
  householdId,
  listId,
  list,
  parentState,
}: {
  householdId: string;
  listId: string;
  list: List | undefined;
  parentState: string;
}) {
  const [rows, result] = useQuery(
    queries.lists.flashcards({ householdId, listId }),
  );
  const connected = useZeroMutationEnabled();
  const zero = useZero();
  const navigate = useNavigate();
  const available = list?.kind === "flashcards" && parentState === "complete";
  const enabled = available && connected && result.type === "complete";
  const controls = useRef(new Map<string, FlashcardControl>());
  const [, refresh] = useState(0);
  const onActivity = useCallback(() => refresh((n) => n + 1), []);
  const [fresh, setFresh] = useState<string>();
  const [working, setWorking] = useState(false);
  const workRef = useRef(false);
  const [ordering, setOrdering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [shuffle, setShuffle] = useState(false);
  const [session, setSession] = useState<{
    id: string;
    cards: PracticeCard[];
  }>();
  const [focusId, setFocusId] = useState<string>();
  const studyButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const focusStudy = useRef(false);
  const allowLeave = useRef(false);
  const busy = working || ordering || dragging;
  useBlockAppUpdate(busy || confirming || Boolean(session));

  const title = useTextRecordEditor({
    initial: { name: list?.name ?? "" },
    persisted: true,
    current: list ? { name: list.name } : undefined,
    enabled: available && connected,
    prepare: (value) => {
      const parsed = listNameSchema.safeParse(value.name);
      return parsed.success ? { name: parsed.data } : undefined;
    },
    invalidError:
      "The deck name needs 1–100 characters. Your draft is still here.",
    save: async (next) => {
      const outcome = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.rename({
            householdId,
            listId,
            name: next.name,
            optimisticUpdatedAt: Date.now(),
          }),
        ),
      );
      if (outcome.type === "error") {
        throw Error("Rename failed");
      }
    },
  });
  const snapshots = [...controls.current.values()].map((control) =>
    control.snapshot(),
  );
  const dirty = title.hasChanges || snapshots.some((s) => s.hasChanges);
  const entries: Entry[] = (available ? rows : []).map((row) => ({
    id: row.id,
    front: row.front,
    back: row.back,
    persisted: true,
  }));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  if (
    fresh &&
    !entries.some((entry) => entry.id === fresh) &&
    (available || controls.current.get(fresh)?.snapshot().hasChanges)
  ) {
    entries.unshift({ id: fresh, front: "", back: "", persisted: false });
  }
  for (const [id, control] of controls.current) {
    const snapshot = control.snapshot();

    if (snapshot.hasChanges && !entries.some((entry) => entry.id === id)) {
      entries.push({ id, ...snapshot.value, persisted: snapshot.saved });
    }
  }

  const hasNewRow = entries.some((entry) => !entry.persisted);
  const freshSnapshot = fresh
    ? controls.current.get(fresh)?.snapshot()
    : undefined;
  const freshSaved = freshSnapshot?.saved;
  const freshSaving = freshSnapshot?.isSaving;

  useEffect(() => {
    if (
      fresh &&
      freshSaved &&
      !freshSaving &&
      rows.some((row) => row.id === fresh)
    ) {
      setFresh(undefined);
    }
  }, [fresh, rows, freshSaved, freshSaving]);

  useEffect(() => {
    if (
      (parentState === "complete" && !list) ||
      parentState === "error" ||
      result.type === "error"
    ) {
      setSession(undefined);
    }
  }, [list, parentState, result.type]);
  useLayoutEffect(() => {
    if (!session && focusStudy.current) {
      focusStudy.current = false;
      if (studyButton.current?.disabled) {
        nameInput.current?.focus();
      } else {
        studyButton.current?.focus();
      }
    }
    if (focusId) {
      document
        .querySelector<HTMLTextAreaElement>(
          `[data-flashcard="${focusId}"] textarea`,
        )
        ?.focus({ preventScroll: true });
      setFocusId(undefined);
    }
  }, [session, focusId]);

  async function flushAll() {
    if (!(await title.flush())) {
      return false;
    }
    // Use a stable control list: saves may insert/reorder rows during the flush.
    for (const control of [...controls.current.values()]) {
      if (!(await control.flush())) {
        return false;
      }
    }
    return true;
  }

  async function act(action: () => void | Promise<void>) {
    if (workRef.current || ordering || dragging) {
      return;
    }
    workRef.current = true;
    setWorking(true);
    setError(undefined);

    try {
      if (await flushAll()) {
        await action();
      }
    } finally {
      workRef.current = false;
      setWorking(false);
    }
  }

  function start() {
    return act(() => {
      if (!available || result.type !== "complete") {
        return;
      }
      const cards = rowsRef.current.map(({ id, front, back }) => ({
        id,
        front,
        back,
      }));
      const newControl = fresh
        ? controls.current.get(fresh)?.snapshot()
        : undefined;

      if (
        fresh &&
        newControl?.saved &&
        !cards.some((card) => card.id === fresh)
      ) {
        cards.unshift({ id: fresh, ...newControl.value });
      }
      const latest = cards.map((card) => ({
        ...card,
        ...(controls.current.get(card.id)?.snapshot().value ?? {}),
      }));

      if (latest.length === 0) {
        focusStudy.current = true;
        setSession(undefined);
        return;
      }

      if (
        latest.length > 0 &&
        latest.every(
          (card) =>
            flashcardFieldsSchema.safeParse({
              front: card.front,
              back: card.back,
            }).success,
        )
      ) {
        setSession({
          id: crypto.randomUUID(),
          cards: practiceSnapshot(latest, shuffle),
        });
      }
    });
  }

  async function reorder(cardId: string, from: number, to: number) {
    if (
      !enabled ||
      dirty ||
      working ||
      ordering ||
      hasNewRow ||
      from === to ||
      to < 0 ||
      to >= rows.length
    ) {
      return;
    }

    const reordered = [...rows];
    const moved = reordered.splice(from, 1)[0];
    if (!moved || moved.id !== cardId) {
      return;
    }
    reordered.splice(to, 0, moved);
    const orderedIds = reordered
      .slice(Math.max(0, to - 1), to + 2)
      .map((row) => row.id);
    setOrdering(true);
    setError(undefined);

    try {
      const outcome = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.reorderFlashcards({
            householdId,
            listId,
            cardId,
            orderedIds,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (outcome.type === "error") {
        throw Error("Reorder failed");
      }
    } catch {
      setError("Unable to reorder these cards. Try moving the card again.");
    } finally {
      setOrdering(false);
    }
  }

  async function removeDeck() {
    if (!enabled || busy || dirty || workRef.current) {
      return;
    }
    workRef.current = true;
    setWorking(true);
    setError(undefined);

    try {
      const outcome = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.delete({
            householdId,
            listId,
            optimisticDeletedAt: Date.now(),
          }),
        ),
      );
      if (outcome.type === "error") {
        throw Error("Delete failed");
      }
      allowLeave.current = true;
      await navigate({
        to: "/households/$householdId/lists",
        params: { householdId },
        replace: true,
      });
    } catch {
      setError("Unable to delete this deck. Try again.");
    } finally {
      workRef.current = false;
      setWorking(false);
    }
  }

  function exit() {
    focusStudy.current = true;
    setSession(undefined);
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-4">
      {(available || title.hasChanges) && (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {session ? (
            <h1 className="min-w-0 wrap-anywhere text-xl font-semibold text-primary">
              {title.value.name}
            </h1>
          ) : (
            <Input
              ref={nameInput}
              appearance="seamless"
              aria-label="List name"
              value={title.value.name}
              maxLength={100}
              readOnly={!available || !connected || busy}
              className="min-w-0 flex-1 text-xl font-semibold text-primary"
              onValueChange={(name) => title.change({ name })}
              onBlur={() => {
                if (!title.error) {
                  void title.flush();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void title.flush();
                }
              }}
            />
          )}
          {!session && (
            <ConfirmationPopover
              message="Delete this deck and its cards for everyone in the household?"
              onOpenChange={setConfirming}
              trigger={
                <Button
                  size="compact"
                  variant="ghost"
                  className="size-7! shrink-0 p-0!"
                  aria-label="Delete list"
                  disabled={!enabled || busy || dirty}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              }
              onConfirm={() => void removeDeck()}
            />
          )}
        </div>
      )}
      {title.error && (
        <p role="alert" className="text-sm text-danger">
          {title.error}
        </p>
      )}
      <TextDraftActions editor={title} />
      {(!available || result.type === "error") && (
        <div className="grid gap-2">
          <p role="alert" className="text-sm text-muted">
            {parentState === "error" || result.type === "error"
              ? "Unable to load this deck."
              : parentState !== "complete"
                ? "Loading deck…"
                : "This deck is no longer available. Any unsaved drafts remain here."}
          </p>
          <Link
            to="/households/$householdId/lists"
            params={{ householdId }}
            className="text-primary underline"
          >
            Back to lists
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {session && available && result.type !== "error" && (
        <FlashcardStudy
          key={session.id}
          cards={session.cards}
          onExit={exit}
          onRestart={() => void start()}
        />
      )}
      <div hidden={Boolean(session && available)} className="min-w-0">
        {available && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                ref={studyButton}
                size="compact"
                variant="ghost"
                disabled={
                  busy || result.type !== "complete" || rows.length === 0
                }
                onClick={() => void start()}
              >
                <Play aria-hidden="true" className="size-4" />
                Study
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={shuffle}
                  disabled={busy}
                  onChange={(event) => setShuffle(event.target.checked)}
                />
                Shuffle
              </label>
            </div>
            <Button
              size="compact"
              variant="ghost"
              disabled={!enabled || busy}
              onClick={() =>
                void act(() => {
                  setFresh(crypto.randomUUID());
                })
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add card
            </Button>
          </div>
        )}
        {available && result.type === "complete" && entries.length === 0 && (
          <p className="py-4 text-sm text-muted">No cards yet.</p>
        )}
        {available && result.type === "unknown" && rows.length === 0 && (
          <p role="status" className="py-4 text-sm text-muted">
            Loading cards…
          </p>
        )}
        <DragDropProvider
          sensors={listOrderingSensors}
          onDragStart={() => setDragging(true)}
          onDragEnd={(event) => {
            setDragging(false);
            const source = event.operation.source;
            if (
              !enabled ||
              dirty ||
              working ||
              ordering ||
              event.canceled ||
              !isSortable(source)
            ) {
              return;
            }
            const from = rows.findIndex((row) => row.id === source.id);
            if (from >= 0) {
              void reorder(String(source.id), from, source.index);
            }
          }}
        >
          <ul
            className="min-w-0 divide-y divide-border"
            aria-label="Flashcards"
          >
            {entries.map((entry, index) => (
              <FlashcardRow
                key={entry.id}
                householdId={householdId}
                listId={listId}
                cardId={entry.id}
                initial={{ front: entry.front, back: entry.back }}
                current={rows.find((row) => row.id === entry.id)}
                persisted={entry.persisted}
                enabled={enabled}
                blocked={busy || Boolean(session)}
                orderDisabled={
                  !enabled ||
                  working ||
                  ordering ||
                  dirty ||
                  hasNewRow ||
                  Boolean(session)
                }
                index={index}
                autoFocus={fresh === entry.id}
                controls={(control) => {
                  if (control) {
                    controls.current.set(entry.id, control);
                  } else {
                    controls.current.delete(entry.id);
                  }
                }}
                onActivity={onActivity}
                onRemoved={() => {
                  const neighbor = entries[index + 1] ?? entries[index - 1];
                  controls.current.delete(entry.id);
                  setFresh((id) => (id === entry.id ? undefined : id));
                  setFocusId(neighbor?.id);
                  onActivity();
                }}
              />
            ))}
          </ul>
        </DragDropProvider>
      </div>
      <TextDraftGuard
        editor={{
          get hasChanges() {
            return !allowLeave.current && (busy || dirty);
          },
          isSaving: busy || title.isSaving || snapshots.some((s) => s.isSaving),
          error: undefined,
          retry() {},
          discard() {
            title.discard();
            for (const control of controls.current.values()) {
              control.discard();
            }
          },
        }}
      />
    </div>
  );
}
