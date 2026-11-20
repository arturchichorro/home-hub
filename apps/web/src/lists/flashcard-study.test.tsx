import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FlashcardStudy } from "./flashcard-study";

it("starts on the front with Next and Previous disabled, without answer markup or grading", () => {
  const html = renderToStaticMarkup(
    <FlashcardStudy
      cards={[{ id: "a", front: "Bonjour", back: "SECRET ANSWER" }]}
      onExit={() => {}}
      onRestart={() => {}}
    />,
  );
  expect(html).toContain("Bonjour");
  expect(html).not.toContain("SECRET ANSWER");
  expect(html).toContain("Show answer");
  expect(html).toMatch(
    /<button[^>]* disabled=""[^>]*><span[^>]*>Next<\/span><\/button>/,
  );
  expect(html).toMatch(
    /<button[^>]* disabled=""[^>]*><span[^>]*>Previous<\/span><\/button>/,
  );
  expect(html).not.toContain("Remembered");
  expect(html).toContain("1 / 1");
});
it("has a quiet finish state with restart and return, not a score", () => {
  const html = renderToStaticMarkup(
    <FlashcardStudy cards={[]} onExit={() => {}} onRestart={() => {}} />,
  );
  expect(html).toContain("Finished");
  expect(html).toContain("Practice again");
  expect(html).toContain("Back to cards");
  expect(html).not.toContain("score");
});
