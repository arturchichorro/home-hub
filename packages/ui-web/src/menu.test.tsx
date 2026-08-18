import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MenuChevron,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "./menu";

describe("Menu", () => {
  it("renders a closed menu trigger with button semantics", () => {
    const markup = renderToStaticMarkup(
      <MenuRoot>
        <MenuTrigger>Household</MenuTrigger>
        <MenuPopup>
          <MenuItem>Home</MenuItem>
          <MenuSeparator />
          <MenuItem variant="danger">Leave</MenuItem>
        </MenuPopup>
      </MenuRoot>,
    );

    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain("Household");
  });

  it("provides a decorative, muted menu chevron", () => {
    const markup = renderToStaticMarkup(<MenuChevron />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("text-muted");
    expect(markup).toContain('d="m4 6 4 4 4-4"');
  });
});
