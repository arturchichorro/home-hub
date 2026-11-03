import {
  type DocumentRead,
  signDocumentRead,
} from "@home-hub/shared/document-delivery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDocumentRequest } from "./documents";

const secret = "isolated-document-test-secret-32bytes";
const cap: DocumentRead = {
  householdId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  fileId: crypto.randomUUID(),
  hash: "a".repeat(64),
  filename: "policy.pdf",
  contentType: "application/pdf",
  disposition: "inline",
  expiresAt: Math.floor(Date.now() / 1000) + 900,
};
const bytes = new TextEncoder().encode("%PDF-document");
const head = vi.fn(async () => ({ size: bytes.length, httpEtag: '"etag"' })),
  get = vi.fn(
    async (
      _key: string,
      opts?: { range: { offset: number; length: number } },
    ) => ({
      body: new Blob([
        opts
          ? bytes.slice(
              opts.range.offset,
              opts.range.offset + opts.range.length,
            )
          : bytes,
      ]).stream(),
    }),
  );
const env = {
  IMAGE_DELIVERY_SIGNING_SECRET: secret,
  RECIPE_IMAGES: { head, get },
};
async function request(
  headers?: HeadersInit,
  method = "GET",
  override: Partial<DocumentRead> = {},
  tamper = false,
) {
  const c = { ...cap, ...override },
    url = new URL("https://files.example/documents/files");
  url.searchParams.set("capability", JSON.stringify(c));
  url.searchParams.set(
    "signature",
    await signDocumentRead(tamper ? cap : c, secret),
  );
  return handleDocumentRequest(
    new Request(url, { method, ...(headers ? { headers } : {}) }),
    env,
  );
}
beforeEach(() => vi.clearAllMocks());
describe("signed document delivery", () => {
  it("serves isolated PDFs, no-store and native ranges", async () => {
    const r = await request({ Range: "bytes=1-4" });
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 1-4/13");
    expect(await r.text()).toBe("PDF-");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Cache-Control")).toContain("no-store");
  });
  it("HEAD has no body or object GET", async () => {
    const r = await request(undefined, "HEAD");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    "bytes=-0",
    "bytes=999-",
    "bytes=1-0",
    "bytes=0-1,3-4",
    "units=0-1",
  ])("rejects invalid range %s", async (range) =>
    expect((await request({ Range: range })).status).toBe(416),
  );
  it("authenticates before metadata/object access", async () => {
    expect(
      (
        await request(
          undefined,
          "GET",
          { documentId: crypto.randomUUID() },
          true,
        )
      ).status,
    ).toBe(403);
    expect(head).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it("does not advertise body bytes if an object disappears after HEAD", async () => {
    const c = { ...cap };
    const url = new URL("https://files.example/documents/files");
    url.searchParams.set("capability", JSON.stringify(c));
    url.searchParams.set("signature", await signDocumentRead(c, secret));
    for (const get of [
      async () => null,
      async () => {
        throw Error("storage failure");
      },
    ]) {
      const response = await handleDocumentRequest(
        new Request(url, { headers: { Range: "bytes=0-1" } }),
        { ...env, RECIPE_IMAGES: { head, get } },
      );
      expect([404, 503]).toContain(response.status);
      expect(response.headers.has("Content-Length")).toBe(false);
      expect(response.headers.has("Content-Range")).toBe(false);
    }
  });
  it("rejects expiry", async () => {
    expect((await request(undefined, "GET", { expiresAt: 1 })).status).toBe(
      403,
    );
    expect(head).not.toHaveBeenCalled();
  });
  it("forces download for text even with an inline request", async () => {
    const r = await request(undefined, "GET", {
      filename: "notes.md",
      contentType: "text/markdown",
    });
    expect(r.headers.get("Content-Disposition")).toMatch(/^attachment/u);
  });
  it("binds filename, content type, hash and disposition in the signature", async () => {
    for (const value of [
      { filename: "other.pdf" },
      { contentType: "image/png" },
      { hash: "b".repeat(64) },
      { disposition: "attachment" as const },
    ])
      expect((await request(undefined, "GET", value, true)).status).toBe(403);
  });
});
