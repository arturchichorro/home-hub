import { stillImageContentTypeSchema } from "@home-hub/shared/media";
import {
  type MediaIdentity,
  mediaProcessingLifetimeSeconds,
  signMediaCapability,
} from "@home-hub/shared/media-delivery";

export class InvalidMediaUploadError extends Error {
  constructor() {
    super("Unsupported or invalid image upload");
  }
}
export async function processMediaImage({
  baseUrl,
  identity,
  contentType,
  byteSize,
  fetchRequest = fetch,
  now = new Date(),
  secret,
}: {
  baseUrl: string;
  identity: MediaIdentity;
  contentType: string;
  byteSize: number;
  fetchRequest?: typeof fetch;
  now?: Date;
  secret: string;
}): Promise<void> {
  const capability = {
    ...identity,
    contentType: stillImageContentTypeSchema.parse(contentType),
    byteSize,
    expiresAt:
      Math.floor(now.getTime() / 1_000) + mediaProcessingLifetimeSeconds,
  };
  const signature = await signMediaCapability({
    capability,
    purpose: "process",
    secret,
  });
  const url = new URL(
    "internal/media/images/process",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  const response = await fetchRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...capability, signature }),
  });
  if (response.status === 422) throw new InvalidMediaUploadError();
  if (!response.ok)
    throw new Error(`Media image processing failed (${response.status})`);
}
