import {
  type CatalogExercise,
  exerciseCatalogSchema,
  normalizeExerciseName,
} from "@home-hub/shared/workouts";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxRoot,
  ComboboxTrigger,
  Plus,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";

type Option = CatalogExercise & { create?: boolean };

export function AddExercisePicker({
  householdId,
  disabled,
  onSelect,
  allowCreate = true,
  iconOnly = false,
  excludedExerciseIds = [],
}: {
  householdId: string;
  disabled: boolean;
  allowCreate?: boolean;
  iconOnly?: boolean;
  excludedExerciseIds?: readonly string[];
  onSelect: (exercise: CatalogExercise) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [data, result] = useQuery(
    // Log-only drafts need the selected definitions for optimistic set writes,
    // even after the picker closes. Normal template editing still loads on open.
    open || !allowCreate
      ? queries.workouts.definitions({ householdId })
      : undefined,
  );
  const rows = result.type === "complete" ? (data ?? []) : [];
  const name = search.trim();
  const normalized = normalizeExerciseName(name);
  const excluded = new Set(excludedExerciseIds);
  const options: Option[] = rows
    .filter(
      (row) => !excluded.has(row.id) && row.normalizedName.includes(normalized),
    )
    .map((row) =>
      exerciseCatalogSchema.parse({
        id: row.id,
        name: row.name,
        unit: row.unit,
        load: row.load,
        unilateral: row.unilateral,
      }),
    );

  if (
    allowCreate &&
    result.type === "complete" &&
    name &&
    !rows.some((row) => row.normalizedName === normalized)
  ) {
    options.push({
      id: "__create__",
      name,
      unit: "reps",
      load: "per-hand",
      unilateral: false,
      create: true,
    });
  }

  return (
    <ComboboxRoot<Option>
      items={options}
      filter={null}
      value={null}
      inputValue={search}
      onInputValueChange={setSearch}
      open={open}
      onOpenChange={(value) => {
        setOpen(value);

        if (!value) {
          setSearch("");
        }
      }}
      disabled={disabled}
      itemToStringLabel={(option) => option.name}
      onValueChange={(option) => {
        if (
          !option ||
          disabled ||
          result.type !== "complete" ||
          excluded.has(option.id) ||
          (!allowCreate && option.create)
        ) {
          return;
        }

        onSelect({
          id: option.create ? crypto.randomUUID() : option.id,
          name: option.name,
          unit: option.unit,
          load: option.load,
          unilateral: option.unilateral,
        });
        setOpen(false);
        setSearch("");
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="ghost"
            title={iconOnly ? "Add exercise" : undefined}
            className="h-7! px-1! text-xs! font-normal text-muted sm:text-sm!"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className={iconOnly ? "sr-only" : undefined}>
              Add exercise
            </span>
          </Button>
        }
      />
      <ComboboxPopup>
        <ComboboxInput
          aria-label={allowCreate ? "Find or create exercise" : "Find exercise"}
          placeholder={
            allowCreate ? "Find or create exercise…" : "Find exercise…"
          }
          maxLength={150}
          autoFocus
        />
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.id} value={option}>
              {option.create ? `Create “${option.name}”` : option.name}
            </ComboboxItem>
          )}
        </ComboboxList>
        {result.type !== "complete" && (
          <p role="status" className="px-3 py-2 text-xs text-muted">
            {result.type === "error"
              ? "Unable to load exercises. Close and reopen to retry."
              : "Loading exercises…"}
          </p>
        )}
        {result.type === "complete" && !options.length && (
          <p className="px-3 py-2 text-xs text-muted">
            {allowCreate
              ? "Type an exercise name to create one."
              : "No available exercises match."}
          </p>
        )}
      </ComboboxPopup>
    </ComboboxRoot>
  );
}
