import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContextMenuPopup,
  ContextMenuRoot,
  ContextMenuTrigger,
} from "./context-menu";

describe("ContextMenu", () => {
  it("renders a closed context-menu trigger with touch support", () => {
    const markup = renderToStaticMarkup(
      <ContextMenuRoot>
        <ContextMenuTrigger>Ingredient</ContextMenuTrigger>
        <ContextMenuPopup>Editor</ContextMenuPopup>
      </ContextMenuRoot>,
    );

    expect(markup).toContain("-webkit-touch-callout:none");
    expect(markup).toContain("Ingredient");
  });
});
