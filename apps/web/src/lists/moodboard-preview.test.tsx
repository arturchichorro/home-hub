import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MoodboardPreview } from "./moodboard-preview";

it("bounds the card mosaic to four tiles and labels videos without autoplay", () => {
  const html = renderToStaticMarkup(
    <MoodboardPreview
      pins={Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        householdId: "hh",
        listId: "list",
        asset: { id: String(i), kind: "video", width: 400, height: 600 },
      }))}
    />,
  );
  expect(html.match(/aria-label="Video"/g)).toHaveLength(4);
  expect(html).not.toContain("media items");
  expect(html).not.toContain("media item");
  expect(html).not.toContain("<video");
  expect(html).not.toContain("autoplay");
});
