import type { ExerciseStats } from "@home-hub/shared/exercise-stats";
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
} from "@home-hub/ui-web";

const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

export function ExerciseStatistics({ stats }: { stats: ExerciseStats }) {
  return (
    <section aria-label="Lifetime statistics" className="grid gap-2 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">
        {stats.reps.sets > 0 && (
          <Stat label="Reps" value={number(stats.reps.total)} />
        )}
        {stats.seconds.sets > 0 && (
          <Stat label="Time" value={`${number(stats.seconds.total)} seconds`} />
        )}
        <Stat label="Sessions" value={number(stats.sessions)} />
        <Stat label="Sets" value={number(stats.sets)} />
        {stats.lastOn && <Stat label="Last performed" value={stats.lastOn} />}
        {(stats.volumeKg !== null || stats.unmeasuredSets > 0) && (
          <Stat
            label="External-load volume"
            value={
              stats.volumeKg === null
                ? "Not recorded"
                : `${number(stats.volumeKg)} kg${stats.unmeasuredSets ? " · partial" : ""}`
            }
          />
        )}
      </dl>
      {(stats.reps.unilateralSets > 0 ||
        stats.seconds.unilateralSets > 0 ||
        stats.records.length > 0 ||
        stats.volumeKg !== null ||
        stats.unmeasuredSets > 0) && (
        <AccordionRoot>
          <AccordionItem value="statistics">
            <AccordionHeader>
              <AccordionTrigger>Stats details</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <dl className="grid gap-2 py-2 text-xs text-muted">
                {(["reps", "seconds"] as const).map(
                  (unit) =>
                    stats[unit].unilateralSets > 0 && (
                      <Stat
                        key={unit}
                        label={`Unilateral ${unit}`}
                        value={`Left ${number(stats[unit].left)} · Right ${number(stats[unit].right)} · Total ${number(stats[unit].left + stats[unit].right)}`}
                      />
                    ),
                )}
                {stats.records.map((record) => (
                  <Stat
                    key={`${record.unit}:${record.load}:${record.unilateral}`}
                    label={`Heaviest · ${record.unit === "seconds" ? "timed" : "reps"} · ${record.load === "per-hand" ? "per hand" : "single load"} · ${record.unilateral ? "each side" : "together"}`}
                    value={`${number(record.weightKg)} kg${record.load === "per-hand" ? "/hand" : ""}`}
                  />
                ))}
              </dl>
              {stats.unmeasuredSets > 0 && (
                <p className="text-xs text-muted">
                  {stats.unmeasuredSets}{" "}
                  {stats.unmeasuredSets === 1 ? "set" : "sets"} missing weight;
                  volume is partial.
                </p>
              )}
            </AccordionPanel>
          </AccordionItem>
        </AccordionRoot>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
