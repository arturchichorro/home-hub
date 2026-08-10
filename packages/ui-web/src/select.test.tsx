import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelectItem, SelectPopup, SelectRoot, SelectTrigger } from "./select";

describe("Select", () => {
  it("renders a closed select trigger with combobox semantics", () => {
    const markup = renderToStaticMarkup(
      <SelectRoot value="general">
        <SelectTrigger>Recipe in general</SelectTrigger>
        <SelectPopup>
          <SelectItem value="general">Recipe in general</SelectItem>
          <SelectItem value="cooking-log">Cooking log</SelectItem>
        </SelectPopup>
      </SelectRoot>,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain("Recipe in general");
  });
});
