import {
  documentReadKey,
  documentReadSchema,
  verifyDocumentRead,
} from "@home-hub/shared/document-delivery";

type ThumbnailImages = {
  input(stream: ReadableStream): {
    transform(options: { fit: "cover"; width: number; height: number }): {
      output(options: {
        format: "image/webp";
        quality: number;
      }): Promise<{ response(): Response }>;
    };
  };
};
type Bucket = {
  put?(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ): Promise<unknown>;
  head?(key: string): Promise<{ size: number; httpEtag?: string } | null>;
  get(
    key: string,
    options?: { range: { offset: number; length: number } },
  ): Promise<{ body: ReadableStream } | null>;
};
export async function handleDocumentRequest(
  request: Request,
  env: {
    RECIPE_IMAGES: Bucket;
    IMAGE_DELIVERY_SIGNING_SECRET: string;
    IMAGES?: ThumbnailImages;
  },
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, ETag",
  });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers });
  const url = new URL(request.url);
  let data: unknown;
  try {
    data = JSON.parse(url.searchParams.get("capability") ?? "null");
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const cap = documentReadSchema.safeParse(data);
  if (!cap.success) return new Response(null, { status: 400, headers });
  if (
    cap.data.expiresAt <= Math.floor(Date.now() / 1000) ||
    cap.data.expiresAt > Math.floor(Date.now() / 1000) + 3600 ||
    !(await verifyDocumentRead(
      cap.data,
      url.searchParams.get("signature") ?? "",
      env.IMAGE_DELIVERY_SIGNING_SECRET,
    ))
  )
    return new Response(null, { status: 403, headers });
  const c = cap.data,
    key = documentReadKey(c);
  try {
    if (c.thumbnail) {
      if (!c.contentType.startsWith("image/"))
        return new Response(null, { status: 415, headers });
      const thumbnailKey = `${key}/thumbnail-96-q82-v1.webp`;
      headers.set("Content-Type", "image/webp");
      headers.set("Content-Disposition", 'inline; filename="thumbnail.webp"');
      const cached = await env.RECIPE_IMAGES.get(thumbnailKey);
      if (cached) {
        if (request.method === "HEAD") await cached.body.cancel();
        return new Response(request.method === "HEAD" ? null : cached.body, {
          headers,
        });
      }
      if (!env.IMAGES || !env.RECIPE_IMAGES.put)
        return new Response(null, { status: 503, headers });
      const original = await env.RECIPE_IMAGES.get(key);
      if (!original) return new Response(null, { status: 404, headers });
      const output = await env.IMAGES.input(original.body)
        .transform({ width: 96, height: 96, fit: "cover" })
        .output({ format: "image/webp", quality: 82 });
      const response = output.response();
      if (!response.ok) return new Response(null, { status: 503, headers });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 262144)
        return new Response(null, { status: 503, headers });
      await env.RECIPE_IMAGES.put(thumbnailKey, bytes, {
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "private, max-age=31536000, immutable",
        },
      });
      headers.set("Content-Length", String(bytes.byteLength));
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers,
      });
    }
    const meta = await env.RECIPE_IMAGES.head?.(key);
    if (!meta) return new Response(null, { status: 404, headers });
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Type", c.contentType);
    const inline =
      c.disposition === "inline" &&
      (c.contentType === "application/pdf" ||
        c.contentType.startsWith("image/"));
    headers.set(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${encodeURIComponent(c.filename).replace(/[!'()*]/gu, (v) => `%${v.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    );
    headers.set("Content-Security-Policy", "default-src 'none'");
    if (meta.httpEtag) headers.set("ETag", meta.httpEtag);
    let range: { offset: number; length: number } | undefined;
    const requested = request.headers.get("Range");
    if (
      request.method === "GET" &&
      requested &&
      (!request.headers.get("If-Range") ||
        request.headers.get("If-Range") === meta.httpEtag)
    ) {
      const m = /^bytes=(\d*)-(\d*)$/u.exec(requested);
      const start = m?.[1]
        ? Number(m[1])
        : Math.max(0, meta.size - Number(m?.[2]));
      const end = m?.[1]
        ? m[2]
          ? Math.min(Number(m[2]), meta.size - 1)
          : meta.size - 1
        : meta.size - 1;
      if (
        !m ||
        (!m[1] && !m[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= meta.size ||
        end < start
      ) {
        headers.set("Content-Range", `bytes */${meta.size}`);
        return new Response(null, { status: 416, headers });
      }
      range = { offset: start, length: end - start + 1 };
      headers.set("Content-Range", `bytes ${start}-${end}/${meta.size}`);
    }
    headers.set("Content-Length", String(range?.length ?? meta.size));
    if (request.method === "HEAD") return new Response(null, { headers });
    const body = await env.RECIPE_IMAGES.get(
      key,
      range ? { range } : undefined,
    );
    if (!body) {
      headers.delete("Content-Length");
      headers.delete("Content-Range");
      return new Response(null, { status: 404, headers });
    }
    return new Response(body.body, {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    headers.delete("Content-Length");
    headers.delete("Content-Range");
    return new Response(null, { status: 503, headers });
  }
}
