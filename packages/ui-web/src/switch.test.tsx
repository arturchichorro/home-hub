import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renders its visible label and switch state", () => {
    const markup = renderToStaticMarkup(
      <Switch label="Lists" description="Enable the lists module." checked />,
    );

    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain("Lists");
    expect(markup).toContain("Enable the lists module.");
  });
});
