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

function errorResponse(status: 400 | 403 | 404 | 405 | 500): Response {
  const messages = {
    400: "Invalid image request",
    403: "Image access denied",
    404: "Image not found",
    405: "Method not allowed",
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
}: {
  env: ImageDeliveryEnv;
  identity: RecipeImageIdentity;
  variant: RecipeImageVariant;
}): Promise<Response | undefined> {
  const original = await env.RECIPE_IMAGES.get(
    recipeImageOriginalObjectKey(identity),
  );
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
  identity: RecipeImageIdentity,
  variant: RecipeImageStoredVariant,
  body: ArrayBuffer | ReadableStream,
) {
  return env.RECIPE_IMAGES.put(
    recipeImageDerivativeObjectKey({ ...identity, variant }),
    body,
    {
      httpMetadata: {
        cacheControl: "public, max-age=31536000, immutable",
        contentType: "image/webp",
      },
    },
  );
}

async function generateAndStoreDerivative(
  env: ImageDeliveryEnv,
  identity: RecipeImageIdentity,
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
  const cacheKey = new Request(cacheKeyUrl, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return privateDeliveryResponse(cached, privateMaxAgeSeconds);

  try {
    const identity = capability satisfies RecipeImageIdentity;
    if (isStoredVariant(capability.variant)) {
      const stored = await env.RECIPE_IMAGES.get(
        recipeImageDerivativeObjectKey({
          ...identity,
          variant: capability.variant,
        }),
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
      variant: capability.variant,
    });
    if (!transformed) return errorResponse(404);

    if (isStoredVariant(capability.variant)) {
      const derivativeBody = transformed.clone().body;
      if (!derivativeBody) return errorResponse(500);
      context.waitUntil(
        storeDerivative(env, identity, capability.variant, derivativeBody),
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

export default {
  fetch(
    request: Request,
    env: ImageDeliveryEnv,
    context: ExecutionContextLike,
  ) {
    if (new URL(request.url).pathname === "/internal/recipe-images/process") {
      return handleRecipeImageProcessingRequest({ env, request });
    }
    const defaultCache = (caches as CacheStorage & { default: Cache }).default;
    return handleRecipeImageDeliveryRequest({
      cache: defaultCache,
      context,
      env,
      request,
    });
  },
};
