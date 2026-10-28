import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  type CatalogExercise,
  exerciseCatalogSchema,
  normalizeExerciseName,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  ErrorPopover,
  GripVertical,
  IconButton,
  InlineAlert,
  Input,
  MenuItem,
  Plus,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  blockAppUpdate,
  hasUpdateBlockers,
  useBlockAppUpdate,
} from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  catalogPageSize,
  catalogWindow,
  moveCatalogEntry,
} from "./catalog-window";
import { ExerciseMedia, ExerciseMediaBatch } from "./exercise-media";
import { ExerciseSettings } from "./exercise-settings";
import {
  type CatalogSaveResult,
  useCatalogExerciseEditor,
} from "./use-catalog-exercise-editor";
import { workoutOrderingSensors } from "./workout-list";

type Draft = { id: string; saved?: boolean };
type RowControls = { flush: () => Promise<boolean>; focus: () => void };
const catalogFields = (
  row: Pick<CatalogExercise, "id" | "name" | "unilateral"> & {
    unit: string;
    load: string;
  },
) =>
  exerciseCatalogSchema.parse({
    id: row.id,
    name: row.name,
    unit: row.unit,
    load: row.load,
    unilateral: row.unilateral,
  });
const defaultExercise = (id: string): CatalogExercise => ({
  id,
  name: "",
  unit: "reps",
  load: "per-hand",
  unilateral: false,
});

export function ExerciseCatalog({ householdId }: { householdId: string }) {
  const zero = useZero();
  return (
    <CatalogContent
      key={`${zero.userID}:${householdId}`}
      householdId={householdId}
    />
  );
}
function CatalogContent({ householdId }: { householdId: string }) {
  const section = useRef<HTMLElement>(null);
  const [rows, result] = useQuery(queries.workouts.catalog({ householdId }));
  const zero = useZero(),
    connected = useZeroMutationEnabled();
  const enabled = connected && result.type === "complete";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(new Set<string>());
  const [dragging, setDragging] = useState(false);
  useBlockAppUpdate(dragging);
  function dirtyChanged(id: string, value: boolean) {
    setDirty((previous) => {
      if (previous.has(id) === value) return previous;
      const next = new Set(previous);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function canLeave() {
    if (hasUpdateBlockers() || (draft && !draft.saved)) {
      setActionError("Finish the current edit or upload first.");
      return false;
    }
    return true;
  }
  const [draft, setDraft] = useState<Draft>();
  const [pinnedId, setPinnedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const draftControl = useRef<RowControls>(null);
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const activeDraftId = draft?.id;
  const draftRow = rows.find((row) => row.id === activeDraftId);
  const [actionError, setActionError] = useState<string>();
  const normalized = normalizeExerciseName(search);
  const entries: { id: string; row: CatalogExercise | undefined }[] = rows
    .filter(
      (row) =>
        row.normalizedName.includes(normalized) ||
        row.id === pinnedId ||
        (row.id === activeDraftId && !draft?.saved),
    )
    .map((row) => ({ id: row.id, row: catalogFields(row) }));
  if (draft && !draft.saved && !draftRow)
    entries.unshift({
      id: draft.id,
      row: undefined,
    });
  const pinned = new Set(dirty);
  if (pinnedId) pinned.add(pinnedId);
  if (draft && !draft.saved) pinned.add(draft.id);
  const window = catalogWindow(entries, page, pinned);
  useEffect(() => {
    if (page !== window.page) setPage(window.page);
  }, [page, window.page]);
  const canOrder =
    enabled && dirty.size === 0 && (!draft || Boolean(draft.saved));
  function reorder(id: string, to: number) {
    const ids = moveCatalogEntry(
      entries.map((e) => e.id),
      id,
      to,
    );
    if (!canOrder || !ids) return;
    observeAction(
      zero.mutate(
        mutators.workouts.reorderExercises({
          householdId,
          exerciseId: id,
          orderedExerciseIds: ids,
          optimisticTimestamp: Date.now(),
        }),
      ),
      "Unable to reorder exercises.",
    );
  }
  function changePage(next: number) {
    if (!canLeave()) return;
    setPinnedId(undefined);
    setPage(next);
    requestAnimationFrame(() =>
      section.current?.scrollIntoView({ block: "start" }),
    );
  }
  function observeAction(
    mutation: {
      client: PromiseLike<{ type: string }>;
      server: PromiseLike<{ type: string }>;
    },
    message: string,
  ) {
    setActionError(undefined);
    const release = blockAppUpdate();
    void Promise.all([mutation.client, mutation.server])
      .then((outcomes) => {
        if (outcomes.some((outcome) => outcome.type === "error"))
          setActionError(message);
      })
      .catch(() => setActionError(message))
      .finally(release);
  }
  function remove(exerciseId: string) {
    if (!enabled) return;
    if (draft?.id === exerciseId) setDraft(undefined);
    observeAction(
      zero.mutate(
        mutators.workouts.deleteExercise({
          householdId,
          exerciseId,
          optimisticTimestamp: Date.now(),
        }),
      ),
      "Unable to delete exercise.",
    );
  }
  async function save(
    next: CatalogExercise,
    previous: CatalogExercise | undefined,
  ): Promise<CatalogSaveResult> {
    if (!enabled)
      return { error: "Unable to save exercise while disconnected." };
    const duplicate = latestRows.current.find(
      (row) =>
        row.id !== next.id &&
        (!previous ||
          normalizeExerciseName(previous.name) !==
            normalizeExerciseName(next.name)) &&
        row.normalizedName === normalizeExerciseName(next.name),
    );
    if (duplicate)
      return { error: "An exercise with this name already exists." };
    try {
      const mutation = previous
        ? zero.mutate(
            mutators.workouts.updateExercise({
              householdId,
              exerciseId: next.id,
              optimisticTimestamp: Date.now(),
              changes: Object.fromEntries(
                (["name", "unit", "load", "unilateral"] as const)
                  .filter((field) => next[field] !== previous[field])
                  .map((field) => [field, next[field]]),
              ),
            }),
          )
        : zero.mutate(
            mutators.workouts.createExercise({
              householdId,
              exercise: next,
              optimisticTimestamp: Date.now(),
            }),
          );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error")
        return {
          error: "Unable to save exercise. Your changes are still here.",
        };
      if (previous) return { exercise: next };
      return { exercise: next };
    } catch {
      return { error: "Unable to save exercise. Your changes are still here." };
    }
  }
  async function add() {
    if (!enabled || adding) return;
    setAdding(true);
    try {
      if (draftControl.current && !(await draftControl.current.flush())) {
        draftControl.current.focus();
        return;
      }
      if (hasUpdateBlockers()) {
        setActionError("Finish the current edit or upload first.");
        return;
      }
      setPage(0);
      setSearch("");
      setPinnedId(undefined);
      setDraft({ id: crypto.randomUUID() });
    } finally {
      setAdding(false);
    }
  }
  return (
    <section
      ref={section}
      aria-label="Exercise catalog"
      className="grid min-w-0 gap-2"
    >
      <div className="flex items-center justify-between gap-2 pt-3">
        <h2 className="font-semibold">Exercise catalog</h2>
        <IconButton
          aria-label="Add catalog exercise"
          title="Add exercise"
          className="size-7!"
          disabled={!enabled || adding}
          onPointerDown={(event) => {
            if (draft) event.preventDefault();
          }}
          onClick={() => void add()}
        >
          <Plus aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      {result.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load exercises.
        </InlineAlert>
      ) : (
        <>
          <Input
            appearance="seamless"
            aria-label="Search exercises"
            placeholder="Search exercises…"
            disabled={dirty.size > 0 || !!(draft && !draft.saved)}
            value={search}
            onValueChange={(value) => {
              if (!canLeave()) return;
              setSearch(value);
              setPage(0);
              setPinnedId(undefined);
            }}
          />
          {actionError && (
            <InlineAlert role="alert" variant="danger">
              {actionError}
            </InlineAlert>
          )}
          <ExerciseMediaBatch
            householdId={householdId}
            exerciseIds={window.entries.map((e) => e.id).sort()}
          >
            <DragDropProvider
              onDragStart={() => setDragging(true)}
              sensors={workoutOrderingSensors}
              onDragEnd={(event) => {
                setDragging(false);
                const source = event.operation.source;
                if (!canOrder || event.canceled || !isSortable(source)) return;
                const ids = window.entries.map((entry) => entry.id),
                  from = ids.indexOf(String(source.id));
                if (
                  from < 0 ||
                  source.index < 0 ||
                  source.index >= ids.length ||
                  from === source.index
                )
                  return;
                const [id] = ids.splice(from, 1);
                if (!id) return;
                ids.splice(source.index, 0, id);
                const targetId = window.entries[source.index]?.id;
                if (targetId)
                  reorder(
                    id,
                    entries.findIndex((e) => e.id === targetId),
                  );
              }}
            >
              <ul className="divide-y divide-border">
                {window.entries.map((entry, index) => {
                  const isDraft = entry.id === draft?.id;
                  return (
                    <CatalogRow
                      key={entry.id}
                      controls={isDraft ? draftControl : undefined}
                      householdId={householdId}
                      initial={entry.row ?? defaultExercise(entry.id)}
                      current={entry.row}
                      enabled={enabled}
                      autofocus={isDraft && !draft?.saved}
                      save={save}
                      index={index}
                      canOrder={canOrder}
                      onDirtyChange={(value) => dirtyChanged(entry.id, value)}
                      orderActions={
                        <>
                          {window.page > 0 ? (
                            <MenuItem
                              disabled={!canOrder}
                              onClick={() => {
                                const to = Math.max(
                                  0,
                                  entries.findIndex((e) => e.id === entry.id) -
                                    catalogPageSize,
                                );
                                reorder(entry.id, to);
                                setPinnedId(entry.id);
                                setPage(window.page - 1);
                              }}
                            >
                              Move to previous page
                            </MenuItem>
                          ) : null}
                          {window.page < window.pages - 1 ? (
                            <MenuItem
                              disabled={!canOrder}
                              onClick={() => {
                                const to = Math.min(
                                  entries.length - 1,
                                  entries.findIndex((e) => e.id === entry.id) +
                                    catalogPageSize,
                                );
                                reorder(entry.id, to);
                                setPinnedId(entry.id);
                                setPage(window.page + 1);
                              }}
                            >
                              Move to next page
                            </MenuItem>
                          ) : null}
                        </>
                      }
                      onFocus={() => setPinnedId(entry.id)}
                      onCancel={() => {
                        if (isDraft) setDraft(undefined);
                      }}
                      onDelete={() => remove(entry.id)}
                      onSaved={() => {
                        if (isDraft)
                          setDraft((current) =>
                            current?.id === entry.id && !current.saved
                              ? { ...current, saved: true }
                              : current,
                          );
                      }}
                    />
                  );
                })}
              </ul>
            </DragDropProvider>
          </ExerciseMediaBatch>
          {window.pages > 1 ? (
            <nav
              aria-label="Catalog pages"
              className="flex items-center justify-between gap-2"
            >
              <Button
                variant="ghost"
                disabled={
                  window.page === 0 ||
                  dirty.size > 0 ||
                  !!(draft && !draft.saved)
                }
                onClick={() => changePage(window.page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted">
                {window.page + 1} / {window.pages}
              </span>
              <Button
                variant="ghost"
                disabled={
                  window.page >= window.pages - 1 ||
                  dirty.size > 0 ||
                  !!(draft && !draft.saved)
                }
                onClick={() => changePage(window.page + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
          {result.type === "complete" && !entries.length && (
            <p className="text-sm text-muted">
              {search ? "No matching exercises." : "No exercises yet."}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CatalogRow({
  householdId,
  initial,
  current,
  enabled,
  autofocus = false,
  controls,
  save,
  onSaved,
  onCancel,
  onFocus,
  index,
  canOrder,
  onDelete,
  onDirtyChange,
  orderActions,
}: {
  householdId: string;
  initial: CatalogExercise;
  current: CatalogExercise | undefined;
  enabled: boolean;
  autofocus?: boolean;
  controls?: Ref<RowControls> | undefined;
  index: number;
  canOrder: boolean;
  orderActions: ReactNode;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: () => void;
  save: (
    next: CatalogExercise,
    previous: CatalogExercise | undefined,
  ) => Promise<CatalogSaveResult>;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onFocus: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const editor = useCatalogExerciseEditor({
    initial,
    current,
    enabled,
    save,
    onSaved,
  });
  useImperativeHandle(controls, () => ({
    flush: () => editor.flush(),
    focus: () => input.current?.focus(),
  }));
  const dirtyCallback = useRef(onDirtyChange);
  dirtyCallback.current = onDirtyChange;
  const [mediaActive, setMediaActive] = useState(false);
  const dirty = editor.hasChanges || editor.isSaving || mediaActive;
  useEffect(() => {
    dirtyCallback.current(dirty);
  }, [dirty]);
  useEffect(() => () => dirtyCallback.current(false), []);
  const value = editor.value;
  const sortable = useSortable({
    id: initial.id,
    index,
    type: "catalog-exercise",
    accept: "catalog-exercise",
    disabled: !canOrder || !editor.persistedId,
  });
  return (
    <li
      ref={sortable.ref}
      data-catalog-exercise-id={editor.persistedId ?? initial.id}
      className={`grid min-w-0 gap-1 py-2 text-sm ${sortable.isDragging ? "opacity-60" : ""}`}
      onFocusCapture={onFocus}
    >
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          ref={sortable.handleRef}
          aria-label={`Reorder ${value.name || "new exercise"}`}
          title="Reorder exercise"
          className="size-7! shrink-0 touch-none cursor-grab"
          disabled={!canOrder || !editor.persistedId}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </IconButton>
        <Input
          ref={input}
          appearance="seamless"
          aria-label={
            editor.persistedId
              ? `Catalog name for ${current?.name ?? value.name}`
              : "New exercise name"
          }
          placeholder="Exercise name"
          className="h-7! font-medium"
          autoFocus={autofocus}
          disabled={!enabled}
          maxLength={150}
          aria-busy={editor.isSaving || undefined}
          aria-invalid={editor.error ? true : undefined}
          aria-errormessage={editor.error ? errorId : undefined}
          value={value.name}
          onValueChange={(name) => editor.change({ name })}
          onBlur={() => void editor.flush()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void editor.flush();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              editor.revert();
              if (!editor.persistedId) onCancel();
              else event.currentTarget.blur();
            }
          }}
        />
        <ExerciseSettings
          exercise={value}
          disabled={!enabled}
          includeMeasure
          orderActions={orderActions}
          onChange={(patch) => editor.change(patch, true)}
        />
        {editor.persistedId && (
          <ConfirmationPopover
            message="Delete this exercise from all workouts?"
            trigger={
              <IconButton
                aria-label={`Delete ${value.name}`}
                title="Delete exercise"
                className="size-7! shrink-0"
                disabled={!enabled}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            }
            onConfirm={() => {
              editor.revert();
              onDelete();
            }}
          />
        )}
      </div>
      <span className="px-1 text-xs text-muted">
        {value.unit === "seconds" ? "Seconds" : "Reps"} ·{" "}
        {value.load === "bodyweight"
          ? "Bodyweight"
          : value.load === "per-hand"
            ? "kg per hand"
            : "kg"}
        {value.unilateral ? " · Each side" : ""}
      </span>
      {editor.persistedId && (
        <ExerciseMedia
          householdId={householdId}
          exerciseId={editor.persistedId}
          name={value.name}
          onActivityChange={setMediaActive}
        />
      )}
      <ErrorPopover
        anchor={input}
        id={errorId}
        open={Boolean(editor.error)}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </li>
  );
}
