import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxRoot,
  ComboboxTrigger,
} from "./combobox";

describe("Combobox", () => {
  it("renders an accessible collapsed selection trigger", () => {
    const html = renderToStaticMarkup(
      <ComboboxRoot items={["Push-up"]}>
        <ComboboxTrigger>Choose exercise</ComboboxTrigger>
        <ComboboxPopup>
          <ComboboxInput aria-label="Find exercise" />
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </ComboboxRoot>,
    );
    expect(html).toContain("Choose exercise");
    expect(html).toContain('aria-expanded="false"');
  });
  it("uses background-only selection styling without indicator columns", () => {
    const item = ComboboxItem({ value: "Push-up", children: "Push-up" });
    expect(item.props.className).toContain("data-selected:bg-surface");
    expect(item.props.className).toContain("data-highlighted:bg-surface");
    expect(item.props.children).toBe("Push-up");
  });
});
