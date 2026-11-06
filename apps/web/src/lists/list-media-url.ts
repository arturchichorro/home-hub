import { useMemo } from "react";
import { createImageUrlCache } from "../media/create-image-url-cache";
import { createUseImageUrl } from "../media/use-image-url";
import { batchListImageUrl, type ListImageIdentity } from "./list-media-api";

const cache = createImageUrlCache<ListImageIdentity>({
  storageKeyPrefix: "home-hub:list-image-urls:v1:",

  resourceKey: ({ householdId, listId, attachmentId }) =>
    JSON.stringify(["lists", householdId, listId, attachmentId]),

  cacheKey: ({ userId, householdId, listId, attachmentId, variant }) =>
    JSON.stringify([
      userId,
      "lists",
      householdId,
      listId,
      attachmentId,
      variant,
    ]),
});

export const clearListImageUrlCache = cache.clear;

export const invalidateListImageUrl = cache.invalidate;

function prefetchListImage(identity: ListImageIdentity) {
  return cache.getOrCreate(identity, () => batchListImageUrl(identity));
}

const useImageUrl = createUseImageUrl({
  key: cache.key,
  read: cache.read,
  resolve: prefetchListImage,
});

export function useListImageUrl(
  input: Omit<ListImageIdentity, "attachmentId"> & {
    attachmentId: string | undefined;
    onSessionExpired: () => void;
  },
) {
  const {
    accessToken,
    userId,
    householdId,
    listId,
    attachmentId,
    variant,
    onSessionExpired,
  } = input;
  const identity = useMemo(
    () =>
      attachmentId
        ? {
            accessToken,
            userId,
            householdId,
            listId,
            attachmentId,
            variant,
          }
        : undefined,
    [accessToken, userId, householdId, listId, attachmentId, variant],
  );

  return useImageUrl(identity, onSessionExpired);
}
