import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("renders the field appearance by default", () => {
    const markup = renderToStaticMarkup(<Input aria-label="Name" />);

    expect(markup).toContain("border-border");
    expect(markup).toContain("bg-surface");
  });

  it("renders a borderless inline appearance", () => {
    const markup = renderToStaticMarkup(
      <Input aria-label="Item name" appearance="inline" />,
    );

    expect(markup).toContain("border-0");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("aria-invalid:ring-danger/40");
  });

  it("renders a seamless appearance without interaction styling", () => {
    const markup = renderToStaticMarkup(
      <Input aria-label="Recipe title" appearance="seamless" />,
    );

    expect(markup).toContain("border-0");
    expect(markup).toContain("bg-transparent");
    expect(markup).not.toContain("hover:");
    expect(markup).not.toContain("focus-visible:");
    expect(markup).not.toContain("aria-invalid:ring");
  });

  it("preserves caller classes and Base UI state attributes", () => {
    const markup = renderToStaticMarkup(
      <Input aria-label="Name" className="text-muted" disabled />,
    );

    expect(markup).toContain("text-muted");
    expect(markup).toContain("data-disabled");
    expect(markup).toContain("disabled");
  });

  it("allows callers to set the font size without a conflicting default", () => {
    const markup = renderToStaticMarkup(
      <Input aria-label="Recipe title" className="text-2xl" />,
    );

    expect(markup).toContain("text-2xl");
    expect(markup).not.toContain("text-base");
  });
});
