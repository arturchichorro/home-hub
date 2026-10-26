import {
  type MediaIdentity,
  mediaDerivativeObjectKey,
  mediaOriginalObjectKey,
  mediaProcessingCapabilitySchema,
  mediaReadCapabilitySchema,
  mediaReadLifetimeSeconds,
  verifyMediaCapability,
} from "@home-hub/shared/media-delivery";
import {
  type RecipeImageDeliveryCapability,
  type RecipeImageIdentity,
  type RecipeImageProcessingCapability,
  type RecipeImageStoredVariant,
  type RecipeImageVariant,
  recipeImageDeliveryCapabilityLifetimeSeconds,
  recipeImageDerivativeObjectKey,
  recipeImageOriginalObjectKey,
  recipeImageStoredVariants,
  recipeImageVariants,
  recipeImageVariantTransforms,
  verifyRecipeImageDeliveryCapability,
  verifyRecipeImageProcessingCapability,
} from "@home-hub/shared/recipe-image-delivery";
import {
  InvalidStillImageError,
  readImageBytes,
  validateStillImage,
} from "./still-image";

function originalObjectKey(identity: RecipeImageIdentity | MediaIdentity) {
  return "mediaId" in identity
    ? mediaOriginalObjectKey(identity)
    : recipeImageOriginalObjectKey(identity);
}
function derivativeObjectKey(
  identity: RecipeImageIdentity | MediaIdentity,
  variant: RecipeImageStoredVariant,
) {
  return "mediaId" in identity
    ? mediaDerivativeObjectKey(identity, variant)
    : recipeImageDerivativeObjectKey({ ...identity, variant });
}

type R2ObjectBody = {
  body: ReadableStream;
};

type R2BucketBinding = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { cacheControl?: string; contentType?: string };
    },
  ): Promise<unknown>;
};

type ImagesOutput = {
  response(): Response;
};

type ImagesTransformer = {
  output(options: {
    format: "image/webp";
    quality: number;
  }): Promise<ImagesOutput>;
  transform(options: {
    fit: "cover" | "scale-down";
    height?: number;
    width: number;
  }): ImagesTransformer;
};

type ImagesBinding = {
  input(stream: ReadableStream): ImagesTransformer;
};

export type ImageDeliveryEnv = {
  IMAGE_DELIVERY_SIGNING_SECRET: string;
  IMAGES: ImagesBinding;
  RECIPE_IMAGES: R2BucketBinding;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

type CacheLike = Pick<Cache, "match" | "put">;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const webpQuality = 82;
const transformVersion = "webp-q82-v3";

function isRecipeImageVariant(value: string): value is RecipeImageVariant {
  return (recipeImageVariants as readonly string[]).includes(value);
}

function isStoredVariant(
  variant: RecipeImageVariant,
): variant is RecipeImageStoredVariant {
  return (recipeImageStoredVariants as readonly string[]).includes(variant);
}

function parseCapability(url: URL): RecipeImageDeliveryCapability | undefined {
  const path = url.pathname.split("/").filter(Boolean);
  if (path.length !== 5 || path[0] !== "recipe-images") return undefined;

  const [, variant, householdId, recipeId, imageId] = path;
  if (
    !variant ||
    !isRecipeImageVariant(variant) ||
    !householdId ||
    !uuidPattern.test(householdId) ||
    !recipeId ||
    !uuidPattern.test(recipeId) ||
    !imageId ||
    !uuidPattern.test(imageId)
  ) {
    return undefined;
  }

  const expiresAt = Number(url.searchParams.get("expires"));
  if (!Number.isSafeInteger(expiresAt)) return undefined;

  return { expiresAt, householdId, imageId, recipeId, variant };
}

function privateDeliveryResponse(
  response: Response,
  maxAgeSeconds: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `private, max-age=${maxAgeSeconds}`);
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { headers, status: response.status });
}

function edgeCacheResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(response.body, { headers, status: response.status });
}

function errorResponse(status: 400 | 403 | 404 | 405 | 422 | 500): Response {
  const messages = {
    400: "Invalid image request",
    403: "Image access denied",
    404: "Image not found",
    405: "Method not allowed",
    422: "Unsupported or invalid image upload",
    500: "Image unavailable",
  } as const;
  return new Response(messages[status], {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function transformOriginal({
  env,
  identity,
  variant,
  source,
}: {
  env: ImageDeliveryEnv;
  identity: RecipeImageIdentity | MediaIdentity;
  variant: RecipeImageVariant;
  source?: Uint8Array<ArrayBuffer>;
}): Promise<Response | undefined> {
  const original = source
    ? { body: new Blob([source]).stream() }
    : await env.RECIPE_IMAGES.get(originalObjectKey(identity));
  if (!original) return undefined;

  const transformed = (
    await env.IMAGES.input(original.body)
      .transform(recipeImageVariantTransforms[variant])
      .output({ format: "image/webp", quality: webpQuality })
  ).response();
  if (!transformed.ok || !transformed.body) {
    throw new Error("Image transform returned an invalid response");
  }
  return transformed;
}

function storeDerivative(
  env: ImageDeliveryEnv,
  identity: RecipeImageIdentity | MediaIdentity,
  variant: RecipeImageStoredVariant,
  body: ArrayBuffer | ReadableStream,
) {
  return env.RECIPE_IMAGES.put(derivativeObjectKey(identity, variant), body, {
    httpMetadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "image/webp",
    },
  });
}

async function generateAndStoreDerivative(
  env: ImageDeliveryEnv,
  identity: RecipeImageIdentity | MediaIdentity,
  variant: RecipeImageStoredVariant,
): Promise<void> {
  const transformed = await transformOriginal({ env, identity, variant });
  if (!transformed) throw new Error("Original image not found");
  await storeDerivative(
    env,
    identity,
    variant,
    await transformed.arrayBuffer(),
  );
}

function parseProcessingRequest(
  value: unknown,
):
  | { capability: RecipeImageProcessingCapability; signature: string }
  | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  if (
    typeof body.householdId !== "string" ||
    !uuidPattern.test(body.householdId) ||
    typeof body.recipeId !== "string" ||
    !uuidPattern.test(body.recipeId) ||
    typeof body.imageId !== "string" ||
    !uuidPattern.test(body.imageId) ||
    !Number.isSafeInteger(body.expiresAt) ||
    typeof body.signature !== "string"
  ) {
    return undefined;
  }
  return {
    capability: {
      expiresAt: body.expiresAt as number,
      householdId: body.householdId,
      imageId: body.imageId,
      recipeId: body.recipeId,
    },
    signature: body.signature,
  };
}

export async function handleRecipeImageProcessingRequest({
  env,
  nowSeconds = Math.floor(Date.now() / 1_000),
  request,
}: {
  env: ImageDeliveryEnv;
  nowSeconds?: number;
  request: Request;
}): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405);

  let parsed: ReturnType<typeof parseProcessingRequest>;
  try {
    parsed = parseProcessingRequest(await request.json());
  } catch {
    return errorResponse(400);
  }
  if (!parsed) return errorResponse(400);

  const authorized = await verifyRecipeImageProcessingCapability({
    ...parsed,
    nowSeconds,
    secret: env.IMAGE_DELIVERY_SIGNING_SECRET,
  });
  if (!authorized) return errorResponse(403);

  try {
    await Promise.all(
      recipeImageStoredVariants.map((variant) =>
        generateAndStoreDerivative(env, parsed.capability, variant),
      ),
    );
    return new Response(null, { status: 204 });
  } catch {
    console.error(JSON.stringify({ event: "recipe_image_processing_failed" }));
    return errorResponse(500);
  }
}

export async function handleRecipeImageDeliveryRequest({
  cache,
  context,
  env,
  nowSeconds = Math.floor(Date.now() / 1_000),
  request,
}: {
  cache: CacheLike;
  context: ExecutionContextLike;
  env: ImageDeliveryEnv;
  nowSeconds?: number;
  request: Request;
}): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405);

  const url = new URL(request.url);
  const capability = parseCapability(url);
  const signature = url.searchParams.get("signature");
  if (!capability || !signature) return errorResponse(400);

  const authorized = await verifyRecipeImageDeliveryCapability({
    capability,
    nowSeconds,
    secret: env.IMAGE_DELIVERY_SIGNING_SECRET,
    signature,
  });
  if (!authorized) return errorResponse(403);
  const privateMaxAgeSeconds = Math.min(
    recipeImageDeliveryCapabilityLifetimeSeconds,
    capability.expiresAt - nowSeconds,
  );

  const cacheKeyUrl = new URL(`${url.origin}${url.pathname}`);
  cacheKeyUrl.searchParams.set("transform", transformVersion);
  return serveImage({
    cache,
    context,
    env,
    identity: capability,
    variant: capability.variant,
    cacheKeyUrl,
    privateMaxAgeSeconds,
  });
}

async function serveImage({
  cache,
  context,
  env,
  identity,
  variant,
  cacheKeyUrl,
  privateMaxAgeSeconds,
}: {
  cache: CacheLike;
  context: ExecutionContextLike;
  env: ImageDeliveryEnv;
  identity: RecipeImageIdentity | MediaIdentity;
  variant: RecipeImageVariant;
  cacheKeyUrl: URL;
  privateMaxAgeSeconds: number;
}): Promise<Response> {
  const cacheKey = new Request(cacheKeyUrl, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return privateDeliveryResponse(cached, privateMaxAgeSeconds);

  try {
    if (isStoredVariant(variant)) {
      const stored = await env.RECIPE_IMAGES.get(
        derivativeObjectKey(identity, variant),
      );
      if (stored) {
        const response = new Response(stored.body, {
          headers: { "Content-Type": "image/webp" },
        });
        context.waitUntil(
          cache.put(cacheKey, edgeCacheResponse(response.clone())),
        );
        return privateDeliveryResponse(response, privateMaxAgeSeconds);
      }
    }

    const transformed = await transformOriginal({
      env,
      identity,
      variant: variant,
    });
    if (!transformed) return errorResponse(404);

    if (isStoredVariant(variant)) {
      const derivativeBody = transformed.clone().body;
      if (!derivativeBody) return errorResponse(500);
      context.waitUntil(
        storeDerivative(env, identity, variant, derivativeBody),
      );
    }

    const cachedResponse = edgeCacheResponse(transformed.clone());
    context.waitUntil(cache.put(cacheKey, cachedResponse));
    return privateDeliveryResponse(transformed, privateMaxAgeSeconds);
  } catch {
    console.error(JSON.stringify({ event: "recipe_image_transform_failed" }));
    return errorResponse(500);
  }
}

export async function handleMediaImageDeliveryRequest({
  cache,
  context,
  env,
  request,
  nowSeconds = Math.floor(Date.now() / 1_000),
}: {
  cache: CacheLike;
  context: ExecutionContextLike;
  env: ImageDeliveryEnv;
  request: Request;
  nowSeconds?: number;
}): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405);
  const url = new URL(request.url);
  if (url.pathname !== "/media/images") return errorResponse(400);
  let raw: unknown;
  try {
    raw = JSON.parse(url.searchParams.get("capability") ?? "");
  } catch {
    return errorResponse(400);
  }
  const parsed = mediaReadCapabilitySchema.safeParse(raw);
  const signature = url.searchParams.get("signature");
  if (!parsed.success || !signature) return errorResponse(400);
  const capability = parsed.data;
  if (
    !(await verifyMediaCapability({
      capability,
      purpose: "read",
      nowSeconds,
      secret: env.IMAGE_DELIVERY_SIGNING_SECRET,
      signature,
    }))
  )
    return errorResponse(403);
  // Partition by immutable storage identity + transform, not the shared route or
  // a caller's unsigned query parameters. Authorization always precedes cache.
  const cacheKeyUrl = new URL(
    `/media-cache/${capability.householdId}/${capability.mediaId}/${capability.variant}`,
    url.origin,
  );
  cacheKeyUrl.searchParams.set(
    "storage",
    capability.storageRecipeId ?? "media",
  );
  cacheKeyUrl.searchParams.set("transform", transformVersion);
  return serveImage({
    cache,
    context,
    env,
    identity: capability,
    variant: capability.variant,
    cacheKeyUrl,
    privateMaxAgeSeconds: Math.min(
      mediaReadLifetimeSeconds,
      capability.expiresAt - nowSeconds,
    ),
  });
}

export async function handleMediaImageProcessingRequest({
  env,
  request,
  nowSeconds = Math.floor(Date.now() / 1_000),
}: {
  env: ImageDeliveryEnv;
  request: Request;
  nowSeconds?: number;
}): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400);
  }
  if (!raw || typeof raw !== "object") return errorResponse(400);
  const { signature, ...unsigned } = raw as Record<string, unknown>;
  const parsed = mediaProcessingCapabilitySchema.safeParse(unsigned);
  if (!parsed.success || typeof signature !== "string")
    return errorResponse(400);
  const capability = parsed.data;
  if (
    !(await verifyMediaCapability({
      capability,
      purpose: "process",
      nowSeconds,
      secret: env.IMAGE_DELIVERY_SIGNING_SECRET,
      signature,
    }))
  )
    return errorResponse(403);
  try {
    const original = await env.RECIPE_IMAGES.get(
      mediaOriginalObjectKey(capability),
    );
    if (!original) return errorResponse(404);
    const source = await readImageBytes(original.body, capability.byteSize);
    validateStillImage(source, capability.contentType);
    // Both variants decode the same validated snapshot, not re-fetchable PUT bytes.
    await Promise.all(
      recipeImageStoredVariants.map(async (variant) => {
        const transformed = await transformOriginal({
          env,
          identity: capability,
          variant,
          source,
        });
        if (!transformed) throw new Error("Original media missing");
        await storeDerivative(
          env,
          capability,
          variant,
          await transformed.arrayBuffer(),
        );
      }),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvalidStillImageError) return errorResponse(422);
    console.error(JSON.stringify({ event: "media_image_processing_failed" }));
    return errorResponse(500);
  }
}

export default {
  fetch(
    request: Request,
    env: ImageDeliveryEnv,
    context: ExecutionContextLike,
  ) {
    const path = new URL(request.url).pathname;
    if (path === "/internal/media/images/process")
      return handleMediaImageProcessingRequest({ env, request });
    if (path === "/internal/recipe-images/process") {
      return handleRecipeImageProcessingRequest({ env, request });
    }
    const defaultCache = (caches as CacheStorage & { default: Cache }).default;
    const handler =
      path === "/media/images"
        ? handleMediaImageDeliveryRequest
        : handleRecipeImageDeliveryRequest;
    return handler({
      cache: defaultCache,
      context,
      env,
      request,
    });
  },
};
