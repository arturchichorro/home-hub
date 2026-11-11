import {
  type WorkoutExercise,
  workoutSetValuesFromRow,
} from "@home-hub/shared/workouts";
import {
  Button,
  ConfirmationPopover,
  IconButton,
  Input,
  Trash2,
} from "@home-hub/ui-web";
import { useId } from "react";
import type { WorkoutLogging } from "./workout-log";
import {
  completeSetValues,
  exerciseForSet,
  setInputErrors,
  setInputKey,
  type WorkoutSetInput,
} from "./workout-log-form";

export function WorkoutSetTable({
  exercise,
  rounds,
  logging,
  disabled,
}: {
  exercise: WorkoutExercise;
  rounds: readonly number[];
  logging: WorkoutLogging;
  disabled: boolean;
}) {
  const validationId = useId();
  const groups: { definition: WorkoutExercise; rounds: number[] }[] = [];

  // Older corrections can contain different recorded conventions. Keep their
  // original order and give each consecutive convention its own truthful header.
  for (const round of rounds) {
    const definition = exerciseForSet(exercise, logging.form, round);
    const group = groups.at(-1);

    if (
      group &&
      group.definition.unit === definition.unit &&
      group.definition.load === definition.load &&
      group.definition.unilateral === definition.unilateral
    ) {
      group.rounds.push(round);
    } else {
      groups.push({ definition, rounds: [round] });
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      {groups.map(({ definition, rounds }) => {
        const weighted = definition.load !== "bodyweight";
        const sides = definition.unilateral;
        const headerClass =
          "border-b border-border px-1 pb-2 text-right font-normal";
        const span = sides ? 2 : 1;

        return (
          <table
            key={`${definition.unit}:${definition.load}:${sides}:${rounds[0]}`}
            aria-label={`${exercise.name}, sets ${rounds.join(", ")}`}
            className="w-full max-w-sm table-fixed border-separate border-spacing-0 text-xs text-muted"
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  rowSpan={span}
                  className="w-16 border-b border-border pb-2 text-left font-normal"
                >
                  Set
                </th>
                {weighted && (
                  <th scope="col" rowSpan={span} className={headerClass}>
                    {definition.load === "per-hand" ? "kg/hand" : "kg"}
                  </th>
                )}
                <th
                  scope={sides ? "colgroup" : "col"}
                  colSpan={sides ? 2 : 1}
                  className={
                    sides ? "px-1 text-center font-normal" : headerClass
                  }
                >
                  {definition.unit === "reps" ? "Reps" : "Seconds"}
                </th>
                <th
                  scope="col"
                  rowSpan={span}
                  className="w-11 border-b border-border pb-2"
                >
                  <span className="sr-only">Set actions</span>
                </th>
              </tr>
              {sides && (
                <tr>
                  <th scope="col" className={headerClass}>
                    Left
                  </th>
                  <th scope="col" className={headerClass}>
                    Right
                  </th>
                </tr>
              )}
            </thead>
            {rounds.map((round) => (
              <WorkoutSetRows
                key={round}
                exercise={exercise}
                definition={definition}
                round={round}
                logging={logging}
                disabled={disabled}
                validationId={validationId}
              />
            ))}
          </table>
        );
      })}
    </div>
  );
}

function WorkoutSetRows({
  exercise,
  definition,
  round,
  logging,
  disabled,
  validationId,
}: {
  exercise: WorkoutExercise;
  definition: WorkoutExercise;
  round: number;
  logging: WorkoutLogging;
  disabled: boolean;
  validationId: string;
}) {
  const { form, state, onChange, onFlush } = logging;
  const key = setInputKey(exercise.id, round);
  const input = form.inputs[key] ?? {
    weightKg: "",
    amount: "",
    rightAmount: "",
  };
  const validation = setInputErrors(definition, input);
  const invalid = Object.keys(validation).length > 0;
  const old = exercise.catalogExerciseId
    ? logging.previous.get(exercise.catalogExerciseId)
    : undefined;
  const prior = old?.sets.find(
    (set) =>
      set.round === round &&
      set.unit === definition.unit &&
      set.load === definition.load &&
      set.unilateral === definition.unilateral,
  );
  const last = prior ? workoutSetValuesFromRow(prior) : undefined;
  const label = `${exercise.name}, set ${round}`;
  const saving = state.saving.has(key);
  const error = state.errors[key];
  const validSet = Boolean(completeSetValues(definition, input));
  const rowDisabled = disabled || state.deleting.has(key);
  const removable =
    state.recorded.has(key) ||
    round > exercise.sets ||
    Object.values(input).some((value) => value !== "");
  const fields: (keyof WorkoutSetInput)[] = [
    ...(definition.load !== "bodyweight" ? ["weightKg" as const] : []),
    "amount",
    ...(definition.unilateral ? ["rightAmount" as const] : []),
  ];
  let status = "";

  if (saving) {
    status = "Saving…";
  } else if (invalid) {
    status = "Invalid";
  } else if (state.dirty.has(key)) {
    status = validSet ? "Unsaved" : "Incomplete";
  } else if (validSet) {
    status = "Saved";
  }

  const previousValue = (field: keyof WorkoutSetInput) => {
    if (!last) {
      return undefined;
    }

    return field === "rightAmount"
      ? (last.rightAmount ?? last.amount)
      : last[field];
  };
  const remove = (
    <IconButton
      aria-label={`Remove ${label}`}
      title="Remove set"
      className="size-10!"
      disabled={rowDisabled}
      onClick={
        state.recorded.has(key)
          ? undefined
          : () => logging.onRemoveSet(exercise.id, round)
      }
    >
      <Trash2 aria-hidden="true" className="size-3.5" />
    </IconButton>
  );
  const columns = fields.length + 2;
  const showStatus = status !== "" && status !== "Saved";

  return (
    <tbody
      data-round={round}
      aria-label={`Log ${label}`}
      aria-busy={saving || undefined}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onFlush(exercise.id, round);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          onFlush(exercise.id, round);
        }
      }}
    >
      <tr>
        <th scope="row" className="text-left font-normal">
          <span className="sr-only">Set </span>
          {round}
        </th>
        {fields.map((field) => {
          const weight = field === "weightKg";
          const name = weight
            ? "Weight in kg"
            : `${definition.unilateral ? (field === "rightAmount" ? "Right " : "Left ") : ""}${definition.unit}`;

          return (
            <td key={field} className="p-0">
              <Input
                appearance="seamless"
                aria-label={`${name} for ${label}`}
                aria-invalid={Boolean(validation[field]) || undefined}
                aria-errormessage={
                  validation[field]
                    ? `${validationId}-${round}-${field}`
                    : undefined
                }
                aria-describedby={
                  last
                    ? `${validationId}-${round}-${field}-previous`
                    : undefined
                }
                className="h-10! w-full text-right text-sm text-foreground tabular-nums"
                type="number"
                min="0"
                max={weight ? 1000 : 600}
                step={weight ? 0.01 : 1}
                required
                disabled={rowDisabled}
                value={input[field]}
                placeholder="—"
                onValueChange={(value) =>
                  onChange(exercise.id, round, { [field]: value })
                }
              />
            </td>
          );
        })}
        <td className="p-0 text-right">
          <span className="sr-only" role="status">
            {status}
          </span>
          {removable &&
            (state.recorded.has(key) ? (
              <ConfirmationPopover
                trigger={remove}
                message="Remove this recorded set?"
                confirmLabel="Remove"
                onConfirm={() => logging.onRemoveSet(exercise.id, round)}
              />
            ) : (
              remove
            ))}
        </td>
      </tr>
      {last && (
        <tr>
          <th scope="row" className="pb-2 text-left text-[10px] font-normal">
            Previous
          </th>
          {fields.map((field) => (
            <td
              key={field}
              id={`${validationId}-${round}-${field}-previous`}
              className="px-1 pb-2 text-right tabular-nums"
            >
              <span className="sr-only">Previous: </span>
              {previousValue(field) ?? "—"}
            </td>
          ))}
          <td />
        </tr>
      )}
      {(showStatus || invalid || error) && (
        <tr>
          <td colSpan={columns} className="pb-2">
            {showStatus && (
              <span aria-hidden="true" className="text-xs text-muted">
                {status}
              </span>
            )}
            {Object.entries(validation).map(([field, message]) => (
              <p
                key={field}
                id={`${validationId}-${round}-${field}`}
                role="alert"
                className="text-xs text-danger"
              >
                {message}
              </p>
            ))}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={rowDisabled || saving}
                  onClick={() => onFlush(exercise.id, round)}
                >
                  Retry
                </Button>
              </p>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}
