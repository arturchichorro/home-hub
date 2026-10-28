import type { CatalogExercise } from "@home-hub/shared/workouts";
import {
  IconButton,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  Settings,
} from "@home-hub/ui-web";
export function ExerciseSettings({
  exercise,
  disabled,
  onChange,
  includeMeasure = false,
}: {
  exercise: Pick<CatalogExercise, "name" | "unit" | "load" | "unilateral">;
  disabled: boolean;
  includeMeasure?: boolean;
  onChange: (
    patch: Partial<Pick<CatalogExercise, "unit" | "load" | "unilateral">>,
  ) => void;
}) {
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={`Settings for ${exercise.name}`}
        title="Exercise settings"
        disabled={disabled}
        render={
          <IconButton
            aria-label={`Settings for ${exercise.name}`}
            className="size-7!"
          >
            <Settings aria-hidden="true" className="size-4" />
          </IconButton>
        }
      />
      <MenuPopup align="end">
        {includeMeasure && (
          <>
            <div className="px-3 py-1 text-xs text-muted">Measure</div>
            <MenuRadioGroup
              aria-label="Measure"
              value={exercise.unit}
              onValueChange={(unit) => {
                if (unit === "reps" || unit === "seconds") onChange({ unit });
              }}
            >
              <MenuRadioItem closeOnClick={false} value="reps">
                Reps
              </MenuRadioItem>
              <MenuRadioItem closeOnClick={false} value="seconds">
                Seconds
              </MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
          </>
        )}
        <div className="px-3 py-1 text-xs text-muted">Load</div>
        <MenuRadioGroup
          aria-label="Load"
          value={exercise.load}
          onValueChange={(load) => {
            if (
              load === "per-hand" ||
              load === "single" ||
              load === "bodyweight"
            )
              onChange({ load });
          }}
        >
          <MenuRadioItem closeOnClick={false} value="per-hand">
            kg per hand
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="single">
            kg single dumbbell
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="bodyweight">
            Bodyweight
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup
          aria-label="Sides"
          value={exercise.unilateral ? "each" : "together"}
          onValueChange={(side) => onChange({ unilateral: side === "each" })}
        >
          <MenuRadioItem closeOnClick={false} value="together">
            Both sides together
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="each">
            Each side
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}
