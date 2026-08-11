import { Button } from "@home-hub/ui-web";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationState } from "./application-state";

describe("ApplicationState", () => {
  it("renders the shared Home Hub presentation and accessible action", () => {
    const markup = renderToStaticMarkup(
      <ApplicationState
        title="Something went wrong"
        description="Home Hub ran into an unexpected problem."
        role="alert"
        actions={<Button>Try again</Button>}
      />,
    );

    expect(markup).toContain("Home Hub");
    expect(markup).toContain("Something went wrong");
    expect(markup).toContain("Home Hub ran into an unexpected problem.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Try again");
  });
});
