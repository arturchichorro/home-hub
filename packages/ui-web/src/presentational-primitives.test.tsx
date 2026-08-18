import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineAlert } from "./inline-alert";
import { Panel } from "./panel";
import { StatusIndicator } from "./status-indicator";

describe("Panel", () => {
  it("renders its optional structural regions", () => {
    const markup = renderToStaticMarkup(
      <Panel
        title="Household"
        description="Manage household settings"
        actions={<button type="button">Rename</button>}
        footer="Last updated today"
        variant="raised"
      >
        Panel content
      </Panel>,
    );

    expect(markup).toContain("<header");
    expect(markup).toContain("Household");
    expect(markup).toContain("Panel content");
    expect(markup).toContain("<footer");
    expect(markup).toContain("shadow-raised");
  });
});

describe("InlineAlert", () => {
  it("uses only the live-region behavior requested by the caller", () => {
    const markup = renderToStaticMarkup(
      <InlineAlert role="alert" title="Could not save" variant="danger">
        Try again.
      </InlineAlert>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("bg-danger/10");
    expect(markup).toContain("Could not save");
    expect(markup).toContain("Try again.");
  });
});

describe("StatusIndicator", () => {
  it("always renders a visible label and opts into announcements", () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator live label="Connected" variant="success" />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("Connected");
  });

  it("is not a live region by default", () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator label="Connecting" variant="warning" />,
    );

    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("aria-live");
  });

  it("allows responsive visual treatment without removing the label", () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator
        label="Connected"
        labelClassName="sr-only sm:not-sr-only"
      />,
    );

    expect(markup).toContain('class="sr-only sm:not-sr-only"');
    expect(markup).toContain("Connected");
  });
});
