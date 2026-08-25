import {
  type RecipeImageDeliveryCapability,
  type RecipeImageVariant,
  recipeImageDeliveryCapabilityLifetimeSeconds,
  recipeImageVariants,
  recipeImageVariantTransforms,
  verifyRecipeImageDeliveryCapability,
} from "@home-hub/shared/recipe-image-delivery";

type R2ObjectBody = {
  body: ReadableStream;
};

type R2BucketBinding = {
  get(key: string): Promise<R2ObjectBody | null>;
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
const transformVersion = "webp-q82-v1";

function isRecipeImageVariant(value: string): value is RecipeImageVariant {
  return (recipeImageVariants as readonly string[]).includes(value);
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

function privateDeliveryResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    `private, max-age=${recipeImageDeliveryCapabilityLifetimeSeconds}`,
  );
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

  const cacheKeyUrl = new URL(`${url.origin}${url.pathname}`);
  cacheKeyUrl.searchParams.set("transform", transformVersion);
  const cacheKey = new Request(cacheKeyUrl, {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return privateDeliveryResponse(cached);

  const objectKey = `households/${capability.householdId}/recipes/${capability.recipeId}/${capability.imageId}`;
  const original = await env.RECIPE_IMAGES.get(objectKey);
  if (!original) return errorResponse(404);

  try {
    const transformed = (
      await env.IMAGES.input(original.body)
        .transform(recipeImageVariantTransforms[capability.variant])
        .output({ format: "image/webp", quality: webpQuality })
    ).response();
    if (!transformed.ok) return errorResponse(500);

    const cachedResponse = edgeCacheResponse(transformed.clone());
    context.waitUntil(cache.put(cacheKey, cachedResponse));
    return privateDeliveryResponse(transformed);
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
    const defaultCache = (caches as CacheStorage & { default: Cache }).default;
    return handleRecipeImageDeliveryRequest({
      cache: defaultCache,
      context,
      env,
      request,
    });
  },
};
