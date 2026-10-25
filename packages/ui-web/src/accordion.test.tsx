import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
} from "./accordion";

const content = (open: boolean) =>
  renderToStaticMarkup(
    <AccordionRoot defaultValue={open ? ["note"] : []}>
      <AccordionItem value="note">
        <AccordionHeader>
          <AccordionTrigger>Note</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Private note</AccordionPanel>
      </AccordionItem>
    </AccordionRoot>,
  );
describe("Accordion", () => {
  it("renders an accessible collapsed trigger and keeps the panel mounted", () => {
    const html = content(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain('role="region"');
    expect(html).toContain('hidden=""');
    expect(html).toContain("Private note");
    expect(html).toContain("lucide-chevron-down");
  });
  it("supports opening a panel with Base UI values", () => {
    const html = content(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain("Private note");
  });
});
