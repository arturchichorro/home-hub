import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AddExercisePicker } from "./add-exercise-picker";

vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
}));

it.each([true, false])(
  "names the exercise combobox independently of icon-only mode (%s)",
  (iconOnly) => {
    const html = renderToStaticMarkup(
      <AddExercisePicker
        householdId={crypto.randomUUID()}
        disabled={false}
        iconOnly={iconOnly}
        onSelect={vi.fn()}
      />,
    );
    const trigger = html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0];
    expect(trigger).toContain('aria-label="Add exercise"');
    expect(trigger).toContain('aria-haspopup="dialog"');
  },
);
