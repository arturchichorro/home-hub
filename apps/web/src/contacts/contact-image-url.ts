import { useMemo } from "react";
import { createImageUrlCache } from "../media/create-image-url-cache";
import { createUseImageUrl } from "../media/use-image-url";
import {
  batchContactImageUrl,
  type ContactImageIdentity,
} from "./contact-media-api";

const cache = createImageUrlCache<ContactImageIdentity>({
  storageKeyPrefix: "home-hub:contact-image-urls:v1:",

  resourceKey: ({ kind, householdId, itemId, attachmentId }) =>
    JSON.stringify(["contacts", kind, householdId, itemId, attachmentId]),

  cacheKey: ({ kind, userId, householdId, itemId, attachmentId, variant }) =>
    JSON.stringify([
      kind,
      userId,
      "contacts",
      householdId,
      itemId,
      attachmentId,
      variant,
    ]),
});

export const clearContactImageUrlCache = cache.clear;

export const invalidateContactImageUrl = cache.invalidate;

export function prefetchContactImage(identity: ContactImageIdentity) {
  return cache.getOrCreate(identity, () => batchContactImageUrl(identity));
}

const useImageUrl = createUseImageUrl({
  key: cache.key,
  read: cache.read,
  resolve: prefetchContactImage,
});

export function useContactImageUrl(
  input: Omit<ContactImageIdentity, "attachmentId"> & {
    attachmentId: string | undefined;
    onSessionExpired: () => void;
  },
) {
  const {
    kind,
    accessToken,
    userId,
    householdId,
    itemId,
    attachmentId,
    variant,
    onSessionExpired,
  } = input;
  const identity = useMemo(
    () =>
      attachmentId
        ? {
            kind,
            accessToken,
            userId,
            householdId,
            itemId,
            attachmentId,
            variant,
          }
        : undefined,
    [kind, accessToken, userId, householdId, itemId, attachmentId, variant],
  );

  return useImageUrl(identity, onSessionExpired);
}
