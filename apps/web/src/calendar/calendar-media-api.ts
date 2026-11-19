import {
  calendarMediaReadRequestSchema,
  calendarMediaReadResponseSchema,
  calendarMediaUploadResponseSchema,
  confirmCalendarMediaResponseSchema,
  createCalendarMediaUploadSchema,
} from "@home-hub/shared/calendar-media";
import type { StillImageContentType } from "@home-hub/shared/media";
import type { MediaReadCapability } from "@home-hub/shared/media-delivery";
import type { ImageReadResult } from "../media/create-image-url-cache";

export type CalendarImageIdentity = {
  accessToken: string;
  userId: string;
  householdId: string;
  itemId: string;
  attachmentId: string;
  variant: MediaReadCapability["variant"];
};

function base(householdId: string) {
  return `/api/households/${encodeURIComponent(householdId)}/calendar/items`;
}

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function failure(response: Response) {
  if (response.status === 401) {
    return { kind: "unauthorized" as const };
  }

  if (response.status === 403) {
    return { kind: "forbidden" as const };
  }

  if (response.status === 404) {
    return { kind: "not_found" as const };
  }

  return undefined;
}

export async function requestCalendarImageUpload(input: {
  accessToken: string;
  householdId: string;
  itemId: string;
  contentType: StillImageContentType;
  byteSize: number;
  width: number;
  height: number;
}) {
  const body = createCalendarMediaUploadSchema.parse({
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
  });
  const response = await fetch(
    `${base(input.householdId)}/${input.itemId}/media/uploads`,
    {
      method: "POST",
      headers: headers(input.accessToken),
      body: JSON.stringify(body),
    },
  );
  const rejected = failure(response);

  if (rejected) {
    return rejected;
  }

  if (!response.ok) {
    throw new Error("Unable to request calendar image upload");
  }

  return {
    kind: "success" as const,
    ...calendarMediaUploadResponseSchema.parse(await response.json()),
  };
}

export async function confirmCalendarImage(
  input: Omit<CalendarImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.itemId}/media/${input.attachmentId}/confirm`,
    { method: "POST", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);

  if (rejected) {
    return rejected;
  }

  if (response.status === 422) {
    return { kind: "invalid_upload" as const };
  }

  if (!response.ok) {
    throw new Error("Unable to confirm calendar image");
  }

  confirmCalendarMediaResponseSchema.parse(await response.json());

  return { kind: "success" as const };
}

export async function deleteCalendarImage(
  input: Omit<CalendarImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId)}/${input.itemId}/media/${input.attachmentId}`,
    { method: "DELETE", headers: headers(input.accessToken) },
  );
  const rejected = failure(response);

  if (rejected) {
    return rejected;
  }

  if (!response.ok) {
    throw new Error("Unable to remove calendar image");
  }

  return { kind: "success" as const };
}

async function readCalendarImageUrls(input: {
  accessToken: string;
  householdId: string;
  requests: {
    itemId: string;
    attachmentId: string;
    variant: MediaReadCapability["variant"];
  }[];
}) {
  const body = calendarMediaReadRequestSchema.parse({
    requests: input.requests,
  });
  const response = await fetch(`${base(input.householdId)}/media/read-urls`, {
    method: "POST",
    headers: headers(input.accessToken),
    body: JSON.stringify(body),
  });
  const rejected = failure(response);

  if (rejected) {
    return rejected;
  }

  if (!response.ok) {
    throw new Error("Unable to read calendar images");
  }

  return {
    kind: "success" as const,
    ...calendarMediaReadResponseSchema.parse(await response.json()),
  };
}

type Pending = {
  identity: CalendarImageIdentity;
  resolve: (value: ImageReadResult) => void;
  reject: (error: unknown) => void;
};

const groups = new Map<string, Pending[]>();

let scheduled = false;

async function flush(reads: Pending[]) {
  const first = reads[0];

  if (!first) {
    return;
  }

  try {
    const result = await readCalendarImageUrls({
      accessToken: first.identity.accessToken,
      householdId: first.identity.householdId,

      requests: reads.map(({ identity }) => ({
        itemId: identity.itemId,
        attachmentId: identity.attachmentId,
        variant: identity.variant,
      })),
    });

    if (result.kind !== "success") {
      for (const item of reads) {
        item.resolve(result);
      }

      return;
    }

    const key = (item: {
      itemId: string;
      attachmentId: string;
      variant: string;
    }) => JSON.stringify([item.itemId, item.attachmentId, item.variant]);
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
    for (const item of reads) {
      item.reject(error);
    }
  }
}

export function batchCalendarImageUrl(
  identity: CalendarImageIdentity,
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

        for (const items of queued) {
          for (let offset = 0; offset < items.length; offset += 100) {
            void flush(items.slice(offset, offset + 100));
          }
        }
      });
    }
  });
}
