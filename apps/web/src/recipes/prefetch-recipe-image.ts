import { createBatchedRecipeImageReadUrl } from "./recipe-image-read-url-batcher";
import {
  getOrCreateRecipeImageUrl,
  type RecipeImageUrlIdentity,
} from "./recipe-image-url-cache";

type NavigatorWithConnection = Navigator & {
  connection?: { effectiveType?: string; saveData?: boolean };
};

export function shouldPrefetchRecipeImages() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) return false;
  return (
    connection?.saveData !== true &&
    connection?.effectiveType !== "slow-2g" &&
    connection?.effectiveType !== "2g"
  );
}

export async function prefetchRecipeImage(identity: RecipeImageUrlIdentity) {
  if (!shouldPrefetchRecipeImages()) return { kind: "skipped" as const };
  const result = await getOrCreateRecipeImageUrl(identity, () =>
    createBatchedRecipeImageReadUrl(identity),
  );
  if (result.kind !== "success" || typeof Image === "undefined") return result;

  await new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = result.url;
  });
  return result;
}

export function scheduleIdleRecipeImagePrefetch(operation: () => void) {
  if (typeof window === "undefined") return () => undefined;
  if (typeof window.requestIdleCallback === "function") {
    const callbackId = window.requestIdleCallback(operation, {
      timeout: 2_000,
    });
    return () => window.cancelIdleCallback(callbackId);
  }
  const timeoutId = globalThis.setTimeout(operation, 500);
  return () => globalThis.clearTimeout(timeoutId);
}
