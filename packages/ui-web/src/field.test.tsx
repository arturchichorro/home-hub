import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, FieldControl, FieldTextarea } from "./field";

describe("Field", () => {
  it("associates its label and renders its description", () => {
    const markup = renderToStaticMarkup(
      <Field label="Email" description="Used to sign in">
        <FieldControl name="email" type="email" />
      </Field>,
    );

    const controlId = markup.match(/<input[^>]*id="([^"]+)"/)?.[1];

    expect(controlId).toBeDefined();
    expect(markup).toContain(`for="${controlId}"`);
    expect(markup).toContain("Used to sign in");
  });

  it("exposes an external error as an invalid field", () => {
    const markup = renderToStaticMarkup(
      <Field label="Email" error="Enter a valid email address">
        <FieldControl name="email" type="email" />
      </Field>,
    );

    expect(markup).toContain("data-invalid");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("Enter a valid email address");
  });

  it("disables the control and exposes progress while busy", () => {
    const markup = renderToStaticMarkup(
      <Field busy label="Email">
        <FieldControl name="email" type="email" />
      </Field>,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
  });

  it("supports a native textarea with the same field relationship", () => {
    const markup = renderToStaticMarkup(
      <Field label="Comment">
        <FieldTextarea name="comment" rows={4} />
      </Field>,
    );
    const controlId = markup.match(/<textarea[^>]*id="([^"]+)"/)?.[1];

    expect(controlId).toBeDefined();
    expect(markup).toContain(`for="${controlId}"`);
    expect(markup).toContain("min-h-24");
    expect(markup).toContain('rows="4"');
  });
});
