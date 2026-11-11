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
  ErrorPopover,
  GripVertical,
  History,
  IconButton,
  InlineAlert,
  Input,
  Plus,
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
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  catalogBatchSize,
  catalogPage,
  reorderNeighborhood,
} from "./catalog-page";
import { ExerciseDetailLink } from "./exercise-detail-link";
import { CatalogMediaProvider, ExerciseMedia } from "./exercise-media";
import { ExerciseRow, ExerciseRowActions } from "./exercise-row";
import { ExerciseSettings } from "./exercise-settings";
import type { ExercisePerformance } from "./training-log-projection";
import {
  type CatalogSaveResult,
  useCatalogExerciseEditor,
} from "./use-catalog-exercise-editor";
import { formatLastDoneDate, workoutOrderingSensors } from "./workout-list";
import { summarizeExercisePerformance } from "./workout-log-summary";

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
  const [rows, result] = useQuery(queries.workouts.catalog({ householdId }));
  const zero = useZero();
  const connected = useZeroMutationEnabled();
  const enabled = connected && result.type === "complete";
  const [search, setSearch] = useState("");
  const [renderLimit, setRenderLimit] = useState(catalogBatchSize);
  const [draft, setDraft] = useState<Draft>();
  const [pinnedId, setPinnedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reordering, setReordering] = useState(false);
  useBlockAppUpdate(dragging || reordering);
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(new Set());
  const draftControl = useRef<RowControls>(null);
  const latestRows = useRef(rows);
  latestRows.current = rows;

  const activeDraftId = draft?.id;
  const draftRow = rows.find((row) => row.id === activeDraftId);
  const [actionError, setActionError] = useState<string>();
  const normalized = normalizeExerciseName(search);
  const entries: {
    id: string;
    row: CatalogExercise | undefined;
    performance?: ExercisePerformance | undefined;
  }[] = rows
    .filter(
      (row) =>
        row.normalizedName.includes(normalized) ||
        row.id === pinnedId ||
        (row.id === activeDraftId && !draft?.saved),
    )
    .map((row) => ({
      id: row.id,
      row: catalogFields(row),
      performance: row.performances?.[0],
    }));

  if (draft && !draft.saved && !draftRow) {
    entries.unshift({
      id: draft.id,
      row: undefined,
    });
  }

  const visibleEntries = catalogPage(
    entries,
    renderLimit,
    pinnedId,
    activeDraftId,
  );
  const canOrder =
    enabled &&
    ordering &&
    !reordering &&
    editingIds.size === 0 &&
    (!draft || Boolean(draft.saved));

  function observeAction(
    mutation: {
      client: PromiseLike<{ type: string }>;
      server: PromiseLike<{ type: string }>;
    },
    message: string,
  ) {
    setActionError(undefined);
    return Promise.all([mutation.client, mutation.server])
      .then((outcomes) => {
        if (outcomes.some((outcome) => outcome.type === "error")) {
          setActionError(message);
          return false;
        }
        return true;
      })
      .catch(() => {
        setActionError(message);
        return false;
      });
  }

  function remove(exerciseId: string) {
    if (!enabled) {
      return false;
    }

    if (draft?.id === exerciseId) {
      setDraft(undefined);
    }

    return observeAction(
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
    if (!enabled) {
      return { error: "Unable to save exercise while disconnected." };
    }

    const duplicate = latestRows.current.find(
      (row) =>
        row.id !== next.id &&
        (!previous ||
          normalizeExerciseName(previous.name) !==
            normalizeExerciseName(next.name)) &&
        row.normalizedName === normalizeExerciseName(next.name),
    );

    if (duplicate) {
      return { error: "An exercise with this name already exists." };
    }

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
      const outcome = await acknowledgeMutation(mutation);

      if (outcome.type === "error") {
        return {
          error: "Unable to save exercise. Your changes are still here.",
        };
      }

      if (previous) {
        return { exercise: next };
      }

      return { exercise: next };
    } catch {
      return { error: "Unable to save exercise. Your changes are still here." };
    }
  }

  async function add() {
    if (!enabled || adding) {
      return;
    }

    setAdding(true);

    try {
      if (draftControl.current && !(await draftControl.current.flush())) {
        draftControl.current.focus();

        return;
      }

      setSearch("");
      setPinnedId(undefined);
      setDraft({ id: crypto.randomUUID() });
    } finally {
      setAdding(false);
    }
  }

  return (
    <CatalogMediaProvider householdId={householdId}>
      <section aria-label="Exercise catalog" className="grid min-w-0 gap-2">
        <div className="flex items-center justify-between gap-2 pt-3">
          <h2 className="text-sm font-medium">Exercise catalog</h2>
          <div className="flex items-center gap-1">
            <Button
              size="compact"
              variant="ghost"
              className="font-normal text-muted"
              disabled={
                !enabled || editingIds.size > 0 || dragging || reordering
              }
              onClick={() => setOrdering((value) => !value)}
            >
              {reordering
                ? "Saving order…"
                : ordering
                  ? "Done reordering"
                  : "Reorder"}
            </Button>
            <IconButton
              aria-label="Add catalog exercise"
              title="Add exercise"
              className="size-7!"
              disabled={!enabled || adding || ordering || editingIds.size > 0}
              onPointerDown={(event) => {
                if (draft) {
                  event.preventDefault();
                }
              }}
              onClick={() => void add()}
            >
              <Plus aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
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
              disabled={editingIds.size > 0 || ordering}
              placeholder="Search exercises…"
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setRenderLimit(catalogBatchSize);
                setPinnedId(undefined);
              }}
            />
            {actionError && (
              <InlineAlert role="alert" variant="danger">
                {actionError}
              </InlineAlert>
            )}
            <DragDropProvider
              key={ordering ? "ordering" : "browse"}
              sensors={workoutOrderingSensors}
              onDragStart={() => setDragging(true)}
              onDragEnd={(event) => {
                setDragging(false);
                const source = event.operation.source;

                if (!canOrder || event.canceled || !isSortable(source)) {
                  return;
                }

                const ids = visibleEntries.map((entry) => entry.id);
                const from = ids.indexOf(String(source.id));

                if (
                  from < 0 ||
                  source.index < 0 ||
                  source.index >= ids.length ||
                  from === source.index
                ) {
                  return;
                }

                const [id] = ids.splice(from, 1);

                if (!id) {
                  return;
                }

                ids.splice(source.index, 0, id);
                setReordering(true);
                void observeAction(
                  zero.mutate(
                    mutators.workouts.reorderExercises({
                      householdId,
                      exerciseId: id,
                      orderedExerciseIds: reorderNeighborhood(ids, id),
                      optimisticTimestamp: Date.now(),
                    }),
                  ),
                  "Unable to reorder exercises.",
                ).finally(() => setReordering(false));
              }}
            >
              <ul className="divide-y divide-border">
                {visibleEntries.map((entry, index) => {
                  const isDraft = entry.id === draft?.id;

                  return (
                    <CatalogRow
                      key={entry.id}
                      controls={isDraft ? draftControl : undefined}
                      householdId={householdId}
                      initial={entry.row ?? defaultExercise(entry.id)}
                      current={entry.row}
                      performance={entry.performance}
                      enabled={
                        enabled &&
                        !ordering &&
                        (editingIds.size === 0 || editingIds.has(entry.id))
                      }
                      onEditingChange={(editing) =>
                        setEditingIds((previous) => {
                          if (previous.has(entry.id) === editing) {
                            return previous;
                          }
                          const next = new Set(previous);
                          if (editing) {
                            next.add(entry.id);
                          } else {
                            next.delete(entry.id);
                          }
                          return next;
                        })
                      }
                      autofocus={isDraft && !draft?.saved}
                      save={save}
                      index={index}
                      canOrder={canOrder}
                      ordering={ordering}
                      onFocus={() => setPinnedId(entry.id)}
                      onCancel={() => {
                        if (isDraft) {
                          setDraft(undefined);
                        }
                      }}
                      onDelete={() => remove(entry.id)}
                      onSaved={() => {
                        if (isDraft) {
                          setDraft((current) =>
                            current?.id === entry.id && !current.saved
                              ? { ...current, saved: true }
                              : current,
                          );
                        }
                      }}
                    />
                  );
                })}
              </ul>
            </DragDropProvider>
            {visibleEntries.length < entries.length && (
              <Button
                variant="ghost"
                onClick={() =>
                  setRenderLimit((count) => count + catalogBatchSize)
                }
              >
                Show more exercises
              </Button>
            )}
            {result.type === "complete" && !entries.length && (
              <p className="text-sm text-muted">
                {search ? "No matching exercises." : "No exercises yet."}
              </p>
            )}
          </>
        )}
      </section>
    </CatalogMediaProvider>
  );
}

type CatalogEditorProps = {
  householdId: string;
  initial: CatalogExercise;
  current: CatalogExercise | undefined;
  performance?: ExercisePerformance | undefined;
  enabled: boolean;
  autofocus?: boolean;
  controls?: Ref<RowControls> | undefined;
  onDelete: () => boolean | undefined | Promise<boolean | undefined>;
  onEditingChange?: (editing: boolean) => void;
  save: (
    next: CatalogExercise,
    previous: CatalogExercise | undefined,
  ) => Promise<CatalogSaveResult>;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  onFocus?: () => void;
};

function CatalogRow({
  index,
  canOrder,
  ordering,
  ...props
}: CatalogEditorProps & {
  index: number;
  canOrder: boolean;
  ordering: boolean;
}) {
  const sortable = useSortable({
    id: props.initial.id,
    index,
    type: "catalog-exercise",
    accept: "catalog-exercise",
    disabled: !canOrder || !props.current,
  });
  return (
    <li
      ref={ordering ? sortable.ref : undefined}
      className={sortable.isDragging ? "opacity-60" : undefined}
    >
      <CatalogExerciseEditor
        {...props}
        handle={
          ordering ? (
            <IconButton
              ref={sortable.handleRef}
              focusableWhenDisabled
              aria-label={`Reorder ${props.current?.name || props.initial.name || "new exercise"}`}
              title="Reorder exercise"
              className="size-7! shrink-0 touch-pan-y cursor-grab"
              disabled={!canOrder || !props.current}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </IconButton>
          ) : null
        }
      />
    </li>
  );
}

export function CatalogExerciseEditor({
  householdId,
  initial,
  current,
  performance,
  enabled,
  autofocus = false,
  controls,
  save,
  onSaved = () => {},
  onCancel,
  onFocus,
  onDelete,
  handle,
  showDetails = true,
  onEditingChange,
}: CatalogEditorProps & {
  handle?: ReactNode;
  showDetails?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();
  const [editing, setEditing] = useState(autofocus || !current);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const notify = useRef(onEditingChange);
  notify.current = onEditingChange;
  useEffect(() => {
    notify.current?.(editing);
  }, [editing]);
  useEffect(() => () => notify.current?.(false), []);
  useEffect(() => {
    if (editing && autofocus && enabled) {
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [editing, autofocus, enabled]);
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      requestAnimationFrame(() =>
        frame.current
          ?.querySelector<HTMLButtonElement>(
            'button[aria-label^="Actions for"]',
          )
          ?.focus(),
      );
    }
  }, [editing]);

  const editor = useCatalogExerciseEditor({
    initial,
    current,
    enabled,
    save,
    onSaved,
  });
  useImperativeHandle(controls, () => ({
    flush: () => editor.flush(),
    focus: () => {
      setEditing(true);
      requestAnimationFrame(() => input.current?.focus());
    },
  }));

  const value = editor.value;
  const draft = {
    ...editor,
    retry: () => {
      void editor.flush();
    },
    discard: editor.revert,
  };

  async function done() {
    if (mediaBusy || finishing) {
      return;
    }
    setFinishing(true);
    const saved = await editor.flush();
    setFinishing(false);
    if (!saved) {
      input.current?.focus();
      return;
    }
    editor.dismissError();
    restoreFocus.current = true;
    setEditing(false);
  }

  return (
    <div
      ref={frame}
      data-catalog-exercise-id={editor.persistedId ?? initial.id}
      className="min-w-0 text-sm"
      onFocusCapture={editing ? onFocus : undefined}
    >
      <ExerciseRow
        editing={editing}
        handle={handle}
        media={
          editor.persistedId ? (
            <ExerciseMedia
              leading
              householdId={householdId}
              exerciseId={editor.persistedId}
              name={value.name}
              readOnly={!editing}
              disabled={!enabled}
              onBusyChange={setMediaBusy}
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-12 rounded-lg bg-raised/50"
            />
          )
        }
        heading={
          editing ? (
            <Input
              ref={input}
              appearance="seamless"
              aria-label={
                editor.persistedId
                  ? `Catalog name for ${current?.name ?? value.name}`
                  : "New exercise name"
              }
              placeholder="Exercise name"
              className="h-8! w-full font-medium"
              autoFocus
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

                  if (!editor.persistedId) {
                    onCancel?.();
                  } else {
                    event.currentTarget.blur();
                  }
                }
              }}
            />
          ) : showDetails && editor.persistedId ? (
            <ExerciseDetailLink
              text
              householdId={householdId}
              exerciseId={editor.persistedId}
              name={value.name}
            />
          ) : (
            <span className="break-words">{value.name}</span>
          )
        }
        actions={
          editing ? (
            <>
              <ExerciseSettings
                exercise={value}
                disabled={!enabled || mediaBusy}
                includeMeasure
                onChange={(patch) => editor.change(patch, true)}
              />
              {editor.persistedId && editor.hasChanges && !editor.error && (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={editor.isSaving || mediaBusy}
                  onClick={editor.revert}
                >
                  Discard
                </Button>
              )}
              {!editor.persistedId && onCancel && (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={editor.isSaving || mediaBusy}
                  onClick={() => {
                    editor.revert();
                    onCancel();
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="compact"
                variant="ghost"
                disabled={mediaBusy}
                busy={finishing}
                onClick={() => void done()}
              >
                Done
              </Button>
            </>
          ) : (
            <span>
              <ExerciseRowActions
                name={value.name}
                disabled={!enabled || editor.hasChanges || mediaBusy}
                onEdit={() => {
                  setEditing(true);
                  requestAnimationFrame(() => input.current?.focus());
                }}
                onRemove={editor.persistedId ? onDelete : undefined}
              />
            </span>
          )
        }
        metadata={
          <>
            <span>
              {value.unit === "seconds" ? "Seconds" : "Reps"} ·{" "}
              {value.load === "bodyweight"
                ? "Bodyweight"
                : value.load === "per-hand"
                  ? "kg per hand"
                  : "kg"}
              {value.unilateral ? " · Each side" : ""}
            </span>
            {performance && (
              <p
                className="break-words px-1 text-xs text-muted"
                data-exercise-performance
              >
                <span title="Your last performance">
                  <History
                    aria-hidden="true"
                    className="mr-1 inline size-3 align-[-1px]"
                  />
                  <span className="sr-only">Your last: </span>
                </span>
                {formatLastDoneDate(performance.performedOn) ??
                  performance.performedOn}{" "}
                · {summarizeExercisePerformance(performance)}
              </p>
            )}
          </>
        }
      />
      {editor.hasChanges && <TextDraftGuard editor={draft} />}
      <ErrorPopover
        anchor={input}
        id={errorId}
        open={Boolean(editor.error)}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={draft} />
      </ErrorPopover>
    </div>
  );
}
