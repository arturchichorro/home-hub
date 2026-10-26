import { useMemo } from "react";
import { createImageUrlCache } from "../media/create-image-url-cache";
import { createUseImageUrl } from "../media/use-image-url";
import {
  batchExerciseImageUrl,
  type ExerciseImageIdentity,
} from "./exercise-media-api";

const cache = createImageUrlCache<ExerciseImageIdentity>({
  storageKeyPrefix: "home-hub:exercise-image-urls:v1:",
  resourceKey: ({ householdId, exerciseId, attachmentId }) =>
    JSON.stringify(["workouts", householdId, exerciseId, attachmentId]),
  cacheKey: ({ userId, householdId, exerciseId, attachmentId, variant }) =>
    JSON.stringify([
      userId,
      "workouts",
      householdId,
      exerciseId,
      attachmentId,
      variant,
    ]),
});
export const clearExerciseImageUrlCache = cache.clear;
export const invalidateExerciseImageUrl = cache.invalidate;
export function prefetchExerciseImage(identity: ExerciseImageIdentity) {
  return cache.getOrCreate(identity, () => batchExerciseImageUrl(identity));
}
const useImageUrl = createUseImageUrl({
  key: cache.key,
  read: cache.read,
  resolve: prefetchExerciseImage,
});
export function useExerciseImageUrl(
  input: Omit<ExerciseImageIdentity, "attachmentId"> & {
    attachmentId: string | undefined;
    onSessionExpired: () => void;
  },
) {
  const {
    accessToken,
    userId,
    householdId,
    exerciseId,
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
            exerciseId,
            attachmentId,
            variant,
          }
        : undefined,
    [accessToken, userId, householdId, exerciseId, attachmentId, variant],
  );
  return useImageUrl(identity, onSessionExpired);
}
