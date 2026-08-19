import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Collapsible } from "./collapsible";

describe("Collapsible", () => {
  it("renders an open, accessible section by default", () => {
    const markup = renderToStaticMarkup(
      <Collapsible title="Ingredients">Tomatoes</Collapsible>,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Ingredients");
    expect(markup).toContain("Tomatoes");
    expect(markup).toContain("data-open");
    expect(markup).toContain("pt-1");
  });

  it("supports an initially closed section", () => {
    const markup = renderToStaticMarkup(
      <Collapsible title="Cooking history" defaultOpen={false}>
        No entries
      </Collapsible>,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("data-closed");
  });
});
