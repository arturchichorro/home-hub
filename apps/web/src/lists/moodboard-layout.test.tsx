import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MoodboardLayout } from "./moodboard-layout";
import type { MoodboardPin } from "./moodboard-preview";

const pins: MoodboardPin[] = Array.from({ length: 9 }, (_, index) => ({
  id: `pin-${index}`,
  householdId: "household",
  listId: "list",
  asset: { id: `asset-${index}`, kind: "image", width: 600, height: 800 },
}));

it("keeps all keyed tiles under one list parent, independent of visual columns", () => {
  const markup = renderToStaticMarkup(
    <MoodboardLayout pins={pins}>
      {(pin, index, style) => (
        <li key={pin.id} style={style}>
          {index}: {pin.id}
        </li>
      )}
    </MoodboardLayout>,
  );

  expect(markup.match(/<ul\b/g)).toHaveLength(1);
  expect(markup.match(/<li\b/g)).toHaveLength(9);
  expect(markup).toContain('aria-label="Moodboard media"');
  expect(markup.match(/position:absolute/g)).toHaveLength(9);
  expect(markup).not.toContain("NaN");
  expect(markup).not.toContain("Infinity");
});

it("handles an empty board without NaN geometry or a column wrapper", () => {
  const markup = renderToStaticMarkup(
    <MoodboardLayout pins={[]}>{() => null}</MoodboardLayout>,
  );

  expect(markup.match(/<ul\b/g)).toHaveLength(1);
  expect(markup).not.toContain("<li");
  expect(markup).toContain("height:0");
});
