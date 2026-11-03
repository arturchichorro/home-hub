import { describe, expect, it } from "vitest";
import {
  documentContentType,
  documentFilenameSchema,
  documentInitialTitle,
  documentPageSchema,
  documentUploadSchema,
  normalizeDocumentTag,
} from "./documents";

describe("document inputs", () => {
  it.each([
    "letter.pdf",
    "scan.JPG",
    "photo.png",
    "scan.webp",
    "policy.docx",
    "costs.xlsx",
    "slides.pptx",
    "notes.txt",
    "budget.csv",
    "notes.md",
  ])("supports %s", (filename) =>
    expect(
      documentUploadSchema.safeParse({ filename, byteSize: 50 * 1024 * 1024 })
        .success,
    ).toBe(true),
  );
  it.each([
    "page.html",
    "image.svg",
    "macro.docm",
    "legacy.doc",
    "archive.zip",
    "program.exe",
    "animation.gif",
    "../a.pdf",
    "a\\b.pdf",
    "evil\r\n.pdf",
  ])("rejects %s", (filename) =>
    expect(documentFilenameSchema.safeParse(filename).success).toBe(false),
  );
  it("bounds uploads and query windows", () => {
    expect(
      documentUploadSchema.safeParse({ filename: "a.pdf", byteSize: 52428801 })
        .success,
    ).toBe(false);
    expect(
      documentPageSchema.safeParse({
        householdId: crypto.randomUUID(),
        limit: 1001,
      }).success,
    ).toBe(false);
  });
  it("normalizes tags without constraining document title uniqueness", () => {
    expect(normalizeDocumentTag(" Home   INSURANCE ")).toBe("home insurance");
    expect(documentInitialTitle("scan.2026.pdf")).toBe("scan.2026");
    expect(documentContentType("POLICY.PDF")).toBe("application/pdf");
  });
});
