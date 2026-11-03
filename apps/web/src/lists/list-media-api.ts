import {
  confirmListMediaResponseSchema,
  createListMediaUploadSchema,
  listMediaReadRequestSchema,
  listMediaReadResponseSchema,
  listMediaUploadResponseSchema,
} from "@home-hub/shared/list-media";
import type { MediaContentType } from "@home-hub/shared/media";
import type { MediaReadCapability } from "@home-hub/shared/media-delivery";
import type { ImageReadResult } from "../media/create-image-url-cache";

export type ListImageIdentity = {
  accessToken: string;
  userId: string;
  householdId: string;
  listId: string;
  attachmentId: string;
  variant: MediaReadCapability["variant"] | "video";
};
function base(householdId: string) {
  return `/api/households/${encodeURIComponent(householdId)}/lists`;
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
export async function requestListImageUpload(input: {
  accessToken: string;
  householdId: string;
  listId: string;
  contentType: MediaContentType;
  byteSize: number;
  width: number;
  height: number;
}) {
  const body = createListMediaUploadSchema.parse({
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
  });
  const response = await fetch(
    `${base(input.householdId)}/${input.listId}/media/uploads`,
    {
      method: "POST",
      headers: headers(input.accessToken),
      body: JSON.stringify(body),
    },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to request list image upload");
  return {
    kind: "success" as const,
    ...listMediaUploadResponseSchema.parse(await response.json()),
  };
}
export async function confirmListImage(
  input: Omit<ListImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.listId}/media/${input.attachmentId}/confirm`,
    { method: "POST", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (response.status === 422) return { kind: "invalid_upload" as const };
  if (!response.ok) throw new Error("Unable to confirm list image");
  confirmListMediaResponseSchema.parse(await response.json());
  return { kind: "success" as const };
}
export async function deleteListImage(
  input: Omit<ListImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.listId}/media/${input.attachmentId}`,
    { method: "DELETE", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to remove list image");
  return { kind: "success" as const };
}
export async function readListImageUrls(input: {
  accessToken: string;
  householdId: string;
  requests: {
    listId: string;
    attachmentId: string;
    variant: MediaReadCapability["variant"] | "video";
  }[];
}) {
  const body = listMediaReadRequestSchema.parse({
    requests: input.requests,
  });
  const response = await fetch(`${base(input.householdId)}/media/read-urls`, {
    method: "POST",
    headers: headers(input.accessToken),
    body: JSON.stringify(body),
  });
  const rejected = failure(response);
  if (rejected) return rejected;
  if (!response.ok) throw new Error("Unable to read list images");
  return {
    kind: "success" as const,
    ...listMediaReadResponseSchema.parse(await response.json()),
  };
}

type Pending = {
  identity: ListImageIdentity;
  resolve: (value: ImageReadResult) => void;
  reject: (error: unknown) => void;
};
const groups = new Map<string, Pending[]>();
let scheduled = false;
async function flush(reads: Pending[]) {
  const first = reads[0];
  if (!first) return;
  try {
    const result = await readListImageUrls({
      accessToken: first.identity.accessToken,
      householdId: first.identity.householdId,
      requests: reads.map(({ identity }) => ({
        listId: identity.listId,
        attachmentId: identity.attachmentId,
        variant: identity.variant,
      })),
    });
    if (result.kind !== "success") {
      for (const item of reads) item.resolve(result);
      return;
    }
    const key = (item: {
      listId: string;
      attachmentId: string;
      variant: string;
    }) => JSON.stringify([item.listId, item.attachmentId, item.variant]);
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
export function batchListImageUrl(
  identity: ListImageIdentity,
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
