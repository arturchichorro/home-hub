import {
  confirmContactMediaResponseSchema,
  contactMediaReadRequestSchema,
  contactMediaReadResponseSchema,
  contactMediaUploadResponseSchema,
  createContactMediaUploadSchema,
} from "@home-hub/shared/contact-media";
import type { StillImageContentType } from "@home-hub/shared/media";
import type { MediaReadCapability } from "@home-hub/shared/media-delivery";
import type { ImageReadResult } from "../media/create-image-url-cache";

export type ContactMediaKind = "profile" | "entry";

export type ContactImageIdentity = {
  kind: ContactMediaKind;
  accessToken: string;
  userId: string;
  householdId: string;
  itemId: string;
  attachmentId: string;
  variant: MediaReadCapability["variant"];
};

function base(householdId: string, kind: ContactMediaKind) {
  return `/api/households/${encodeURIComponent(householdId)}/contacts/${kind === "profile" ? "profiles" : "entries"}`;
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

export async function requestContactImageUpload(input: {
  accessToken: string;
  kind: ContactMediaKind;
  householdId: string;
  itemId: string;
  contentType: StillImageContentType;
  byteSize: number;
  width: number;
  height: number;
}) {
  const body = createContactMediaUploadSchema.parse({
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
  });
  const response = await fetch(
    `${base(input.householdId, input.kind)}/${input.itemId}/media/uploads`,
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
    throw new Error("Unable to request contact image upload");
  }

  return {
    kind: "success" as const,
    ...contactMediaUploadResponseSchema.parse(await response.json()),
  };
}

export async function confirmContactImage(
  input: Omit<ContactImageIdentity, "userId" | "variant">,
) {
  const response = await fetch(
    `${base(input.householdId, input.kind)}/${input.itemId}/media/${input.attachmentId}/confirm`,
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
    throw new Error("Unable to confirm contact image");
  }

  confirmContactMediaResponseSchema.parse(await response.json());

  return { kind: "success" as const };
}

async function readContactImageUrls(input: {
  accessToken: string;
  kind: ContactMediaKind;
  householdId: string;
  requests: {
    itemId: string;
    attachmentId: string;
    variant: MediaReadCapability["variant"];
  }[];
}) {
  const body = contactMediaReadRequestSchema.parse({
    requests: input.requests,
  });
  const response = await fetch(
    `${base(input.householdId, input.kind)}/media/read-urls`,
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
    throw new Error("Unable to read contact images");
  }

  return {
    kind: "success" as const,
    ...contactMediaReadResponseSchema.parse(await response.json()),
  };
}

type Pending = {
  identity: ContactImageIdentity;
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
    const result = await readContactImageUrls({
      accessToken: first.identity.accessToken,
      kind: first.identity.kind,
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

export function batchContactImageUrl(
  identity: ContactImageIdentity,
): Promise<ImageReadResult> {
  return new Promise((resolve, reject) => {
    const key = JSON.stringify([
      identity.kind,
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
