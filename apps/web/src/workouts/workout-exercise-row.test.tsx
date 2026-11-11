import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkoutExerciseRow } from "./workout-exercise-row";
import type { WorkoutLogging } from "./workout-log";
import { WorkoutLogEditor } from "./workout-log-editor";
import { openWorkoutLog } from "./workout-log-form";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: import("react").ReactNode;
  }) => (
    <a
      {...props}
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));
const householdId = crypto.randomUUID();
const exercise: WorkoutExercise = {
  id: crypto.randomUUID(),
  catalogExerciseId: crypto.randomUUID(),
  name: "A long exercise name that must wrap rather than clipping the final words",
  unit: "reps",
  load: "per-hand",
  unilateral: true,
  sets: 2,
  target: "8–12 controlled",
  role: "warmup",
};
const props = {
  householdId,
  exercise,
  disabled: false,
  editing: false,
  mediaBusy: false,
  canDiscard: false,
  onMediaBusyChange: vi.fn(),
  onEdit: vi.fn(),
  onDone: async () => true,
  onDiscard: vi.fn(),
  onChange: vi.fn(),
  onRemove: async () => true,
};

it("uses a wrapped name link, readable prescription and one actions trigger rather than scattered editors", () => {
  const html = renderToStaticMarkup(<WorkoutExerciseRow {...props} />);
  expect(html).toContain(
    `href="/households/${householdId}/workouts/exercises/${exercise.catalogExerciseId}"`,
  );
  expect(html).toContain(exercise.name);
  expect(html).toContain("break-words");
  expect(html).toContain("2 sets × 8–12 controlled reps · Warm-up");
  expect(html).toContain(`aria-label="Actions for ${exercise.name}"`);
  expect(html).not.toContain("<input");
  expect(html).not.toContain("lucide-book-open");
  expect(html).not.toContain("Settings for");
});
it("reveals original editable values and Done/Discard only in explicit edit mode", () => {
  const html = renderToStaticMarkup(
    <WorkoutExerciseRow {...props} editing canDiscard />,
  );
  expect(html).toContain(`aria-label="Name for ${exercise.name}"`);
  expect(html).toContain(`aria-label="Sets for ${exercise.name}"`);
  expect(html).toContain(`aria-label="Target for ${exercise.name}"`);
  expect(html).toContain('value="8–12 controlled"');
  expect(html).toContain("Done");
  expect(html).toContain("Discard");
  expect(html).not.toContain(">Save<");
});
it("keeps read-only browsing available offline without enabling editing", () => {
  const html = renderToStaticMarkup(<WorkoutExerciseRow {...props} disabled />);
  expect(html).toContain('href="/households/');
  expect(
    html.match(/<button[^>]*aria-label="Actions for[^>]*>/)?.[0],
  ).toContain('disabled=""');
  expect(html).not.toContain("<input");
});
it("keeps logging below the header at full width, with no shared edit controls or fictitious free-session targets", () => {
  const form = openWorkoutLog({
    title: "Free training",
    exercises: [exercise],
  });
  const editor = new WorkoutLogEditor<null>(form, {
    householdId,
    workoutId: null,
    timeZone: "UTC",
    enabled: () => true,
    save: async () => true,
    remove: async () => true,
  });
  const logging: WorkoutLogging = {
    form,
    state: editor.getSnapshot(),
    previous: new Map(),
    onChange: vi.fn(),
    onFlush: vi.fn(),
    onAddExercise: vi.fn(),
    onAddSet: vi.fn(),
    onRemoveSet: vi.fn(),
    freeForm: true,
  };
  const html = renderToStaticMarkup(
    <WorkoutExerciseRow {...props} logging={logging} />,
  );
  expect(html).toContain("col-span-2 min-w-0");
  expect(html).toContain("<table");
  expect(html).toContain(`Left reps for ${exercise.name}, set 1`);
  expect(html).not.toContain("8–12 controlled");
  expect(html).not.toContain("Settings for");
  expect(html).not.toContain('aria-label="Name for');
  expect(html).not.toContain("Actions for");
});
