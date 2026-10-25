import { Select as BaseSelect } from "@base-ui/react/select";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelectItem, SelectPopup, SelectRoot, SelectTrigger } from "./select";

describe("Select", () => {
  it("indicates selection through background only, without an icon column", () => {
    const item = SelectItem({ value: "reps", children: "Reps" });
    expect(item.props.className).toContain("data-selected:bg-surface");
    expect(item.props.className).toContain("data-highlighted:bg-surface");
    expect(item.props.className).not.toContain("grid-cols");
    expect(item.props.children.type).toBe(BaseSelect.ItemText);
    expect(item.props.children.props.children).toBe("Reps");
  });

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
