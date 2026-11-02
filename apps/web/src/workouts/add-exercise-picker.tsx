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
}: {
  householdId: string;
  disabled: boolean;
  onSelect: (exercise: CatalogExercise) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const [data, result] = useQuery(
    open ? queries.workouts.definitions({ householdId }) : undefined,
  );
  const rows = result.type === "complete" ? (data ?? []) : [];
  const name = search.trim(),
    normalized = normalizeExerciseName(name);
  const options: Option[] = rows
    .filter((row) => row.normalizedName.includes(normalized))
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
    result.type === "complete" &&
    name &&
    !rows.some((row) => row.normalizedName === normalized)
  )
    options.push({
      id: "__create__",
      name,
      unit: "reps",
      load: "per-hand",
      unilateral: false,
      create: true,
    });
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
        if (!value) setSearch("");
      }}
      disabled={disabled}
      itemToStringLabel={(option) => option.name}
      onValueChange={(option) => {
        if (!option || disabled || result.type !== "complete") return;
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
            className="h-7! px-1! text-xs! font-normal text-muted sm:text-sm!"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add exercise
          </Button>
        }
      />
      <ComboboxPopup>
        <ComboboxInput
          aria-label="Find or create exercise"
          placeholder="Find or create exercise…"
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
            Type an exercise name to create one.
          </p>
        )}
      </ComboboxPopup>
    </ComboboxRoot>
  );
}
