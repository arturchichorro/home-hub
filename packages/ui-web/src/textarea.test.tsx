import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders the field appearance by default", () => {
    const markup = renderToStaticMarkup(<Textarea aria-label="Description" />);

    expect(markup).toContain("border-border");
    expect(markup).toContain("resize-y");
  });

  it("renders a borderless inline appearance", () => {
    const markup = renderToStaticMarkup(
      <Textarea aria-label="Description" appearance="inline" />,
    );

    expect(markup).toContain("border-0");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("aria-invalid:ring-danger/40");
  });
});
