import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconButton } from "./icon-button";
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

  it("supports the same ghost hover treatment as icon actions", () => {
    const markup = renderToStaticMarkup(
      <MenuRoot>
        <MenuTrigger variant="ghost" aria-label="Settings">
          Settings
        </MenuTrigger>
      </MenuRoot>,
    );
    expect(markup).toContain(
      "bg-transparent text-muted hover:bg-raised hover:text-foreground",
    );
    expect(markup).not.toContain("bg-transparent!");
  });

  it("can use an actual IconButton so hit areas and hover styles match", () => {
    const trigger = renderToStaticMarkup(
      <MenuRoot>
        <MenuTrigger
          aria-label="Settings"
          render={
            <IconButton aria-label="Settings" className="size-7!">
              Settings icon
            </IconButton>
          }
        >
          Settings
        </MenuTrigger>
      </MenuRoot>,
    );
    const icon = renderToStaticMarkup(
      <IconButton aria-label="Remove" className="size-7!">
        Remove
      </IconButton>,
    );
    expect(trigger.match(/class="([^"]+)"/)?.[1]).toBe(
      icon.match(/class="([^"]+)"/)?.[1],
    );
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain("Settings icon");
  });
  it("provides a decorative, muted menu chevron", () => {
    const markup = renderToStaticMarkup(<MenuChevron />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("text-muted");
    expect(markup).toContain("lucide-chevron-down");
  });
});
