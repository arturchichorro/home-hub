import {
  confirmExerciseMediaResponseSchema,
  createExerciseMediaUploadSchema,
  exerciseMediaReadRequestSchema,
  exerciseMediaReadResponseSchema,
  exerciseMediaUploadResponseSchema,
} from "@home-hub/shared/exercise-media";
import type { StillImageContentType } from "@home-hub/shared/media";
import type { MediaReadCapability } from "@home-hub/shared/media-delivery";
import type { ImageReadResult } from "../media/create-image-url-cache";

export type ExerciseImageIdentity = {
  accessToken: string;
  userId: string;
  householdId: string;
  exerciseId: string;
  attachmentId: string;
  variant: MediaReadCapability["variant"];
};
function base(householdId: string) {
  return `/api/households/${encodeURIComponent(householdId)}/workouts/exercises`;
}
function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}
function failure(response: Response) {
  if (response.status === 401) return { kind: "unauthorized" as const };
  if (response.status === 403) return { kind: "forbidden" as const };
  if (response.status === 404) return { kind: "not_found" as const };
  return undefined;
}
export async function requestExerciseImageUpload(input: {
  accessToken: string;
  householdId: string;
  exerciseId: string;
  contentType: StillImageContentType;
  byteSize: number;
  width: number;
  height: number;
}) {
  const body = createExerciseMediaUploadSchema.parse({
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
  });
  const response = await fetch(
    `${base(input.householdId)}/${input.exerciseId}/media/uploads`,
    {
      method: "POST",
      headers: headers(input.accessToken),
      body: JSON.stringify(body),
    },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to request exercise image upload");
  return {
    kind: "success" as const,
    ...exerciseMediaUploadResponseSchema.parse(await response.json()),
  };
}
export async function confirmExerciseImage(
  input: Omit<ExerciseImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.exerciseId}/media/${input.attachmentId}/confirm`,
    { method: "POST", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (response.status === 422) return { kind: "invalid_upload" as const };
  if (!response.ok) throw new Error("Unable to confirm exercise image");
  confirmExerciseMediaResponseSchema.parse(await response.json());
  return { kind: "success" as const };
}
export async function deleteExerciseImage(
  input: Omit<ExerciseImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.exerciseId}/media/${input.attachmentId}`,
    { method: "DELETE", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to remove exercise image");
  return { kind: "success" as const };
}
export async function readExerciseImageUrls(input: {
  accessToken: string;
  householdId: string;
  requests: {
    exerciseId: string;
    attachmentId: string;
    variant: MediaReadCapability["variant"];
  }[];
}) {
  const body = exerciseMediaReadRequestSchema.parse({
    requests: input.requests,
  });
  const response = await fetch(`${base(input.householdId)}/media/read-urls`, {
    method: "POST",
    headers: headers(input.accessToken),
    body: JSON.stringify(body),
  });
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to read exercise images");
  return {
    kind: "success" as const,
    ...exerciseMediaReadResponseSchema.parse(await response.json()),
  };
}

type Pending = {
  identity: ExerciseImageIdentity;
  resolve: (value: ImageReadResult) => void;
  reject: (error: unknown) => void;
};
const groups = new Map<string, Pending[]>();
let scheduled = false;
async function flush(reads: Pending[]) {
  const first = reads[0];
  if (!first) return;
  try {
    const result = await readExerciseImageUrls({
      accessToken: first.identity.accessToken,
      householdId: first.identity.householdId,
      requests: reads.map(({ identity }) => ({
        exerciseId: identity.exerciseId,
        attachmentId: identity.attachmentId,
        variant: identity.variant,
      })),
    });
    if (result.kind !== "success") {
      for (const item of reads) item.resolve(result);
      return;
    }
    const key = (item: {
      exerciseId: string;
      attachmentId: string;
      variant: string;
    }) => JSON.stringify([item.exerciseId, item.attachmentId, item.variant]);
    const urls = new Map(result.reads.map((item) => [key(item), item]));
    for (const item of reads) {
      const match = urls.get(key(item.identity));
      item.resolve(
        match
          ? {
              kind: "success",
              url: match.url,
              expiresInSeconds: match.expiresInSeconds,
            }
          : { kind: "not_found" },
      );
    }
  } catch (error) {
    for (const item of reads) item.reject(error);
  }
}
export function batchExerciseImageUrl(
  identity: ExerciseImageIdentity,
): Promise<ImageReadResult> {
  return new Promise((resolve, reject) => {
    const key = JSON.stringify([
      identity.userId,
      identity.accessToken,
      identity.householdId,
    ]);
    const group = groups.get(key) ?? [];
    group.push({ identity, resolve, reject });
    groups.set(key, group);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const queued = [...groups.values()];
        groups.clear();
        for (const items of queued)
          for (let offset = 0; offset < items.length; offset += 100)
            void flush(items.slice(offset, offset + 100));
      });
    }
  });
}
