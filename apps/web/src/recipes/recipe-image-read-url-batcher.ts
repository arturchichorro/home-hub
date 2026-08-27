import {
  type CreateRecipeImageReadUrlResult,
  createRecipeImageReadUrls,
} from "./image-api";
import type { RecipeImageUrlIdentity } from "./recipe-image-url-cache";

type PendingRead = {
  identity: RecipeImageUrlIdentity;
  reject(error: unknown): void;
  resolve(result: CreateRecipeImageReadUrlResult): void;
};

const pendingGroups = new Map<string, PendingRead[]>();
let flushScheduled = false;

function groupKey(identity: RecipeImageUrlIdentity) {
  return JSON.stringify([identity.accessToken, identity.householdId]);
}

async function flushGroup(reads: PendingRead[]) {
  const first = reads[0];
  if (!first) return;

  try {
    const result = await createRecipeImageReadUrls({
      accessToken: first.identity.accessToken,
      householdId: first.identity.householdId,
      requests: reads.map(({ identity }) => ({
        imageId: identity.imageId,
        recipeId: identity.recipeId,
        variant: identity.variant,
      })),
    });

    if (result.kind !== "success") {
      for (const read of reads) read.resolve(result);
      return;
    }

    const resultsByKey = new Map(
      result.reads.map((read) => [
        `${read.recipeId}:${read.imageId}:${read.variant}`,
        read,
      ]),
    );
    for (const read of reads) {
      const resultForRead = resultsByKey.get(
        `${read.identity.recipeId}:${read.identity.imageId}:${read.identity.variant}`,
      );
      read.resolve(
        resultForRead
          ? {
              kind: "success",
              url: resultForRead.url,
              expiresInSeconds: resultForRead.expiresInSeconds,
            }
          : { kind: "not_found" },
      );
    }
  } catch (error) {
    for (const read of reads) read.reject(error);
  }
}

function flushPendingReads() {
  flushScheduled = false;
  const groups = Array.from(pendingGroups.values());
  pendingGroups.clear();
  for (const reads of groups) {
    for (let index = 0; index < reads.length; index += 100) {
      void flushGroup(reads.slice(index, index + 100));
    }
  }
}

export function createBatchedRecipeImageReadUrl(
  identity: RecipeImageUrlIdentity,
): Promise<CreateRecipeImageReadUrlResult> {
  return new Promise((resolve, reject) => {
    const key = groupKey(identity);
    const group = pendingGroups.get(key) ?? [];
    group.push({ identity, reject, resolve });
    pendingGroups.set(key, group);

    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flushPendingReads);
    }
  });
}
