import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("defaults to a non-submitting primary button", () => {
    const markup = renderToStaticMarkup(<Button>Save</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain("bg-primary");
    expect(markup).toContain(">Save</span>");
  });

  it("applies the requested variant, size, and caller class", () => {
    const markup = renderToStaticMarkup(
      <Button className="w-full" size="compact" variant="danger">
        Remove
      </Button>,
    );

    expect(markup).toContain("bg-danger");
    expect(markup).toContain("h-8");
    expect(markup).toContain("w-full");
  });

  it("keeps its accessible label and remains focusable while busy", () => {
    const markup = renderToStaticMarkup(<Button busy>Saving</Button>);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("Saving");
    expect(markup).toContain('aria-hidden="true"');
  });
});
