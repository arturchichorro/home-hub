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

const head = vi.fn(async () => ({ size: bytes.length, httpEtag: '"etag"' }));

const get = vi.fn(
  async (
    _key: string,
    opts?: { range: { offset: number; length: number } },
  ) => ({
    body: new Blob([
      opts
        ? bytes.slice(opts.range.offset, opts.range.offset + opts.range.length)
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
  const c = { ...cap, ...override };
  const url = new URL("https://files.example/documents/files");
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
  it("binds thumbnail mode independently of original read signatures", async () => {
    expect(
      (await request(undefined, "GET", { thumbnail: true }, true)).status,
    ).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect((await request(undefined, "GET", { thumbnail: true })).status).toBe(
      415,
    );
  });
  it("generates and reuses a fixed bounded image thumbnail, never falling back to the original", async () => {
    const c = {
      ...cap,
      contentType: "image/png",
      filename: "scan.png",
      thumbnail: true as const,
    };
    const url = new URL("https://files.example/documents/files");
    url.searchParams.set("capability", JSON.stringify(c));
    url.searchParams.set("signature", await signDocumentRead(c, secret));

    const stored = new Map<string, ArrayBuffer>();
    const transform = vi.fn();
    const output = vi.fn(async () => ({
      response: () => new Response("small-webp"),
    }));
    const bucket = {
      get: vi.fn(async (key: string) => {
        const cached = stored.get(key);

        if (cached) {
          return { body: new Blob([cached]).stream() };
        }

        if (key.endsWith(".webp")) {
          return null;
        }

        return { body: new Blob(["large-original"]).stream() };
      }),

      put: vi.fn(async (key: string, data: ArrayBuffer) => {
        stored.set(key, data);
      }),
    };
    const images = {
      input: () => ({
        transform: (options: unknown) => {
          transform(options);

          return { output };
        },
      }),
    };
    const response = await handleDocumentRequest(new Request(url), {
      IMAGE_DELIVERY_SIGNING_SECRET: secret,
      RECIPE_IMAGES: bucket,
      IMAGES: images,
    });
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(await response.text()).toBe("small-webp");
    expect(transform).toHaveBeenCalledWith({
      width: 96,
      height: 96,
      fit: "cover",
    });
    expect(output).toHaveBeenCalledWith({ format: "image/webp", quality: 82 });
    expect(
      await (
        await handleDocumentRequest(new Request(url), {
          IMAGE_DELIVERY_SIGNING_SECRET: secret,
          RECIPE_IMAGES: bucket,
        })
      ).text(),
    ).toBe("small-webp");
    expect(transform).toHaveBeenCalledTimes(1);

    const unavailable = await handleDocumentRequest(new Request(url), {
      IMAGE_DELIVERY_SIGNING_SECRET: secret,
      RECIPE_IMAGES: { get: async () => null },
    });
    expect(unavailable.status).toBe(503);
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
    ]) {
      expect((await request(undefined, "GET", value, true)).status).toBe(403);
    }
  });
});
