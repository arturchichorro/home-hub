import { useMemo } from "react";
import { createImageUrlCache } from "../media/create-image-url-cache";
import { createUseImageUrl } from "../media/use-image-url";
import {
  batchCalendarImageUrl,
  type CalendarImageIdentity,
} from "./calendar-media-api";

const cache = createImageUrlCache<CalendarImageIdentity>({
  storageKeyPrefix: "home-hub:calendar-image-urls:v1:",

  resourceKey: ({ householdId, itemId, attachmentId }) =>
    JSON.stringify(["calendar", householdId, itemId, attachmentId]),

  cacheKey: ({ userId, householdId, itemId, attachmentId, variant }) =>
    JSON.stringify([
      userId,
      "calendar",
      householdId,
      itemId,
      attachmentId,
      variant,
    ]),
});

export const clearCalendarImageUrlCache = cache.clear;

export const invalidateCalendarImageUrl = cache.invalidate;

export function prefetchCalendarImage(identity: CalendarImageIdentity) {
  return cache.getOrCreate(identity, () => batchCalendarImageUrl(identity));
}

const useImageUrl = createUseImageUrl({
  key: cache.key,
  read: cache.read,
  resolve: prefetchCalendarImage,
});

export function useCalendarImageUrl(
  input: Omit<CalendarImageIdentity, "attachmentId"> & {
    attachmentId: string | undefined;
    onSessionExpired: () => void;
  },
) {
  const {
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
            accessToken,
            userId,
            householdId,
            itemId,
            attachmentId,
            variant,
          }
        : undefined,
    [accessToken, userId, householdId, itemId, attachmentId, variant],
  );

  return useImageUrl(identity, onSessionExpired);
}
