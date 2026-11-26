import type {
  ContactEntryFields,
  ContactFields,
} from "@home-hub/shared/contacts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EditorStatus } from "./editor-status";

const id = crypto.randomUUID();
function editor(fields: ContactFields | ContactEntryFields) {
  return {
    error: "Changed elsewhere. Your draft is retained.",
    isSaving: false,
    conflict: { fields },
    retry: vi.fn(),
    discard: vi.fn(),
    replace: vi.fn(),
  };
}

it("reviews saved profile values without UUIDs, JSON keys or invented birthday years", () => {
  const html = renderToStaticMarkup(
    <EditorStatus
      editor={editor({
        name: "Ada",
        archived: false,
        details: [
          { id, type: "birthday", label: "Birthday", value: "--02-29" },
        ],
      })}
    />,
  );
  expect(html).toContain("Ada");
  expect(html).toContain("February");
  expect(html).toContain("29");
  expect(html).toContain("year not specified");
  expect(html).not.toContain(id);
  expect(html).not.toContain("--02-29");
  expect(html).not.toContain("2000");
  expect(html).not.toContain("<pre");
  expect(html).toContain("Save my draft");
  expect(html).toContain("Use saved");
});

it("reviews entry dates, contact names and escaped note text", () => {
  const html = renderToStaticMarkup(
    <EditorStatus
      getPersonName={(key) => (key === id ? "Bea" : undefined)}
      editor={editor({
        entryOn: "2026-11-25",
        contactIds: [id, crypto.randomUUID()],
        note: "<script>unsafe</script>",
      })}
    />,
  );
  expect(html).toContain("November");
  expect(html).toContain("2026");
  expect(html).toContain("Bea, Contact name unavailable");
  expect(html).not.toContain(id);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});

it("preserves missing-record and transport-error recovery controls", () => {
  const base = editor({ name: "Ada", details: [], archived: true });
  const missing = renderToStaticMarkup(
    <EditorStatus editor={{ ...base, conflict: null }} />,
  );
  expect(missing).toContain("Use saved");
  expect(missing).not.toContain("Save my draft");
  const failed = renderToStaticMarkup(
    <EditorStatus editor={{ ...base, conflict: undefined }} />,
  );
  expect(failed).toContain("Retry");
  expect(failed).toContain("Discard");
});
