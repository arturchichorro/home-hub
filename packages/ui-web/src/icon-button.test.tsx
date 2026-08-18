import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconButton } from "./icon-button";
import { X } from "./icons";

describe("IconButton", () => {
  it("renders an accessible square ghost button by default", () => {
    const markup = renderToStaticMarkup(
      <IconButton aria-label="Archive item">
        <X aria-hidden="true" />
      </IconButton>,
    );

    expect(markup).toContain('aria-label="Archive item"');
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("size-10!");
    expect(markup).toContain("p-0!");
  });

  it("supports the danger variant and caller classes", () => {
    const markup = renderToStaticMarkup(
      <IconButton
        aria-label="Remove member"
        className="shrink-0"
        variant="danger"
      >
        <X aria-hidden="true" />
      </IconButton>,
    );

    expect(markup).toContain("bg-danger");
    expect(markup).toContain("shrink-0");
  });
});
