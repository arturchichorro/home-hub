import { describe, expect, it } from "vitest";
import { validateDocumentFile } from "./validate-file";

const b = (s: string) => new TextEncoder().encode(s);

describe("document format validation", () => {
  it("validates PDFs and UTF-8 text/Markdown/CSV", () => {
    expect(
      validateDocumentFile(
        "a.pdf",
        b("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"),
      ),
    ).toBe("application/pdf");

    for (const ext of ["txt", "md", "csv"]) {
      expect(validateDocumentFile(`a.${ext}`, b("Olá 👋\nline\ttwo"))).toMatch(
        /^text\//u,
      );
    }
  });
  it.each([
    ["a.pdf", "hello"],
    ["a.png", "%PDF-1.7\n%%EOF"],
    ["a.txt", "\u0000binary"],
    ["a.md", "<html>executable</html>"],
    ["a.docx", "PKnot an Office container"],
    ["a.exe", "MZ"],
  ])("rejects mislabelled/active bytes %s", (name, bytes) =>
    expect(() => validateDocumentFile(name, b(bytes))).toThrow(),
  );
  it("does not accept animation", () =>
    expect(() =>
      validateDocumentFile("a.webp", b("RIFF0000WEBPANIM0000")),
    ).toThrow());
});
