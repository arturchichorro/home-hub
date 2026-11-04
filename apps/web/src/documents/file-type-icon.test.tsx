import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentFileTypeIcon, documentFileType } from "./file-type-icon";

it.each([
  ["application/pdf", "PDF"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "DOCX",
  ],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "PPTX",
  ],
  ["text/csv", "CSV"],
  ["text/markdown", "MD"],
  ["text/plain", "TXT"],
])("shows a compact type badge for %s", (type, label) => {
  expect(documentFileType(type).label).toBe(label);
  expect(
    renderToStaticMarkup(<DocumentFileTypeIcon contentType={type} />),
  ).toContain(`>${label}<`);
});
