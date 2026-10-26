import { normalizeExerciseName } from "@home-hub/shared/workouts";
import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert, Input } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
export function ExerciseCatalog({ householdId }: { householdId: string }) {
  const [rows, result] = useQuery(queries.workouts.catalog({ householdId }));
  const [search, setSearch] = useState("");
  const filtered = rows.filter((e) =>
    e.normalizedName.includes(normalizeExerciseName(search)),
  );
  return (
    <section aria-label="Exercise catalog" className="grid min-w-0 gap-2">
      <h2 className="pt-3 font-semibold">Exercise catalog</h2>
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
            onValueChange={setSearch}
          />
          <ul className="divide-y divide-border">
            {filtered.map((e) => (
              <li key={e.id} className="grid gap-1 py-2 text-sm">
                <span>{e.name}</span>
                <span className="text-xs text-muted">
                  {e.unit === "seconds" ? "Seconds" : "Reps"} ·{" "}
                  {e.load === "bodyweight"
                    ? "Bodyweight"
                    : e.load === "per-hand"
                      ? "kg per hand"
                      : "kg"}
                  {e.unilateral ? " · Each side" : ""}
                </span>
              </li>
            ))}
          </ul>
          {result.type === "complete" && !filtered.length && (
            <p className="text-sm text-muted">
              {search ? "No matching exercises." : "No exercises yet."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
