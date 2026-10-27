import {
  type CatalogExercise,
  exerciseCatalogSchema,
  normalizeExerciseName,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  ErrorPopover,
  IconButton,
  InlineAlert,
  Input,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type Ref, useId, useImperativeHandle, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ExerciseMedia } from "./exercise-media";
import { ExerciseSettings } from "./exercise-settings";
import {
  type CatalogSaveResult,
  useCatalogExerciseEditor,
} from "./use-catalog-exercise-editor";
import { waitForCreatedExercise } from "./wait-for-created-exercise";

type Draft = { id: string; resolvedId?: string };
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
  const zero = useZero(),
    connected = useZeroMutationEnabled();
  const enabled = connected && result.type === "complete";
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [pinnedId, setPinnedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const draftControl = useRef<RowControls>(null);
  const acknowledgedCreations = useRef(new Map<string, CatalogExercise>());
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const activeDraftId = draft?.resolvedId ?? draft?.id;
  const draftRow = rows.find((row) => row.id === activeDraftId);
  const normalized = normalizeExerciseName(search);
  const filtered = rows.filter(
    (row) =>
      row.id !== activeDraftId &&
      (row.normalizedName.includes(normalized) || row.id === pinnedId),
  );
  async function save(
    next: CatalogExercise,
    previous: CatalogExercise | undefined,
  ): Promise<CatalogSaveResult> {
    if (!enabled)
      return { error: "Unable to save exercise while disconnected." };
    const acknowledged = acknowledgedCreations.current.get(next.id);
    if (!previous && acknowledged) {
      const id = await waitForCreatedExercise(
        zero,
        householdId,
        next.id,
        acknowledged.name,
      );
      if (!id) return { error: "Exercise added; waiting for sync. Try again." };
      acknowledgedCreations.current.delete(next.id);
      return { exercise: { ...acknowledged, id } };
    }
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
              optimisticTimestamp: 0,
            }),
          );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error")
        return {
          error: "Unable to save exercise. Your changes are still here.",
        };
      if (previous) return { exercise: next };
      acknowledgedCreations.current.set(next.id, next);
      const id = await waitForCreatedExercise(
        zero,
        householdId,
        next.id,
        next.name,
      );
      if (!id) return { error: "Exercise added; waiting for sync. Try again." };
      acknowledgedCreations.current.delete(next.id);
      return { exercise: { ...next, id } };
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
      setSearch("");
      setPinnedId(undefined);
      setDraft({ id: crypto.randomUUID() });
    } finally {
      setAdding(false);
    }
  }
  return (
    <section aria-label="Exercise catalog" className="grid min-w-0 gap-2">
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
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setPinnedId(undefined);
            }}
          />
          <ul className="divide-y divide-border">
            {draft && (
              <CatalogRow
                key={draft.id}
                controls={draftControl}
                householdId={householdId}
                initial={defaultExercise(draft.id)}
                current={draftRow ? catalogFields(draftRow) : undefined}
                enabled={enabled}
                autofocus
                save={save}
                onFocus={() => {}}
                onCancel={() => setDraft(undefined)}
                onSaved={(id) =>
                  setDraft((current) =>
                    current?.id === draft.id && current.resolvedId !== id
                      ? { ...current, resolvedId: id }
                      : current,
                  )
                }
              />
            )}
            {filtered.map((row) => (
              <CatalogRow
                key={row.id}
                householdId={householdId}
                initial={catalogFields(row)}
                current={catalogFields(row)}
                enabled={enabled}
                save={save}
                onFocus={() => setPinnedId(row.id)}
                onCancel={() => {}}
                onSaved={() => {}}
              />
            ))}
          </ul>
          {result.type === "complete" && !filtered.length && !draft && (
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
}: {
  householdId: string;
  initial: CatalogExercise;
  current: CatalogExercise | undefined;
  enabled: boolean;
  autofocus?: boolean;
  controls?: Ref<RowControls>;
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
  const value = editor.value;
  return (
    <li
      data-catalog-exercise-id={editor.persistedId ?? initial.id}
      className="grid min-w-0 gap-1 py-2 text-sm"
      onFocusCapture={onFocus}
    >
      <div className="flex min-w-0 items-center gap-2">
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
          onChange={(patch) => editor.change(patch, true)}
        />
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
