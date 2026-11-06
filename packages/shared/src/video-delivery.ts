import * as z from "zod";
import { videoContentTypeSchema } from "./media";
import {
  mediaOriginalObjectKey,
  mediaReadCapabilitySchema,
  mediaReadLifetimeSeconds,
} from "./media-delivery";

export const videoReadCapabilitySchema = mediaReadCapabilitySchema
  .omit({ variant: true })
  .extend({
    moduleKey: z.literal("lists"),
    videoVersion: z.string().regex(/^[a-f0-9]{64}$/u),
    contentType: videoContentTypeSchema,
  })
  .strict();

export type VideoReadCapability = z.infer<typeof videoReadCapabilitySchema>;

export function videoObjectKey(c: VideoReadCapability) {
  return `${mediaOriginalObjectKey(c)}/video/${c.videoVersion}/playback.${c.contentType === "video/mp4" ? "mp4" : "webm"}`;
}

async function key(secret: string) {
  if (new TextEncoder().encode(secret).length < 32) {
    throw Error("Signing secret too short");
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const payload = (c: VideoReadCapability) =>
  new TextEncoder().encode(
    JSON.stringify([
      "home-hub-video-read-v1",
      c.householdId,
      c.mediaId,
      c.storageRecipeId,
      c.moduleKey,
      c.parentId,
      c.attachmentId,
      c.videoVersion,
      c.contentType,
      c.expiresAt,
    ]),
  );

export async function signVideoCapability(
  c: VideoReadCapability,
  secret: string,
) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    payload(videoReadCapabilitySchema.parse(c)),
  );

  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyVideoCapability(
  c: VideoReadCapability,
  signature: string,
  secret: string,
  now: number,
) {
  if (
    !/^[a-f0-9]{64}$/u.test(signature) ||
    c.expiresAt <= now ||
    c.expiresAt > now + mediaReadLifetimeSeconds + 5
  ) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    await key(secret),
    new Uint8Array(signature.match(/../gu)?.map((x) => parseInt(x, 16)) ?? []),
    payload(c),
  );
}

export function videoReadUrl(
  baseUrl: string,
  capability: VideoReadCapability,
  signature: string,
) {
  const u = new URL(
    "media/videos",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  u.searchParams.set("capability", JSON.stringify(capability));
  u.searchParams.set("signature", signature);

  return u.toString();
}

export function parseVideoRange(
  value: string,
  size: number,
): { offset: number; length: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);

  if (!match || (!match[1] && !match[2])) {
    return;
  }

  const suffix = !match[1];
  const a = Number(match[1]);
  const b = Number(match[2]);

  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    return;
  }

  const start = suffix ? Math.max(0, size - b) : a;
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, b);

  if (start < 0 || start >= size || end < start || (suffix && b === 0)) {
    return;
  }

  return { offset: start, length: end - start + 1 };
}
