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
    expect(markup).toContain("field-sizing-content");
    expect(markup).toContain("min-h-10");
    expect(markup).toContain("aria-invalid:ring-danger/40");
  });

  it("renders a seamless appearance without interaction styling", () => {
    const markup = renderToStaticMarkup(
      <Textarea aria-label="Recipe description" appearance="seamless" />,
    );

    expect(markup).toContain("border-0");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("field-sizing-content");
    expect(markup).not.toContain("hover:");
    expect(markup).not.toContain("focus-visible:");
    expect(markup).not.toContain("aria-invalid:ring");
  });

  it("allows callers to set the font size without a conflicting default", () => {
    const markup = renderToStaticMarkup(
      <Textarea aria-label="Description" className="text-lg" />,
    );

    expect(markup).toContain("text-lg");
    expect(markup).not.toContain("text-base");
  });
});
