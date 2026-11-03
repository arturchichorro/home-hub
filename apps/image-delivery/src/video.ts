import {
  parseVideoRange,
  verifyVideoCapability,
  videoObjectKey,
  videoReadCapabilitySchema,
} from "@home-hub/shared/video-delivery";

type Head = {
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
};
type Bucket = {
  head?: (key: string) => Promise<Head | null>;
  get: (
    key: string,
    options?: { range: { offset: number; length: number } },
  ) => Promise<{ body: ReadableStream } | null>;
};
export async function handleVideoRequest(
  request: Request,
  env: { IMAGE_DELIVERY_SIGNING_SECRET: string; RECIPE_IMAGES: Bucket },
  now = Math.floor(Date.now() / 1000),
) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(request.url);
  let raw: unknown;
  try {
    raw = JSON.parse(url.searchParams.get("capability") ?? "");
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = videoReadCapabilitySchema.safeParse(raw),
    signature = url.searchParams.get("signature");
  if (!parsed.success || !signature) return new Response(null, { status: 400 });
  const c = parsed.data;
  if (
    !(await verifyVideoCapability(
      c,
      signature,
      env.IMAGE_DELIVERY_SIGNING_SECRET,
      now,
    ))
  )
    return new Response(null, { status: 403 });
  const bucket = env.RECIPE_IMAGES;
  if (!bucket.head) return new Response(null, { status: 503 });
  const objectKey = videoObjectKey(c),
    head = await bucket.head(objectKey);
  if (!head) return new Response(null, { status: 404 });
  const h = new Headers({
    "Content-Type": c.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": `private,max-age=${Math.min(300, c.expiresAt - now)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Referrer-Policy": "no-referrer",
  });
  if (head.httpEtag) h.set("ETag", head.httpEtag);
  const rangeHeader = request.headers.get("Range"),
    ifRange = request.headers.get("If-Range");
  const range =
    rangeHeader && (!ifRange || ifRange === head.httpEtag)
      ? parseVideoRange(rangeHeader, head.size)
      : undefined;
  if (rangeHeader && (!ifRange || ifRange === head.httpEtag) && !range) {
    h.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers: h });
  }
  h.set("Content-Length", String(range?.length ?? head.size));
  if (range)
    h.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
    );
  if (request.method === "HEAD")
    return new Response(null, { status: range ? 206 : 200, headers: h });
  const object = await bucket.get(objectKey, range ? { range } : undefined);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { status: range ? 206 : 200, headers: h });
}
