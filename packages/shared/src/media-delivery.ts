import * as z from "zod";
import { maxStillImageByteSize, stillImageContentTypeSchema } from "./media";
import {
  recipeImageDeliveryCapabilityLifetimeSeconds,
  recipeImageProcessingCapabilityLifetimeSeconds,
  recipeImageVariants,
} from "./recipe-image-delivery";

export const mediaImageVariants = recipeImageVariants;
export const mediaReadLifetimeSeconds =
  recipeImageDeliveryCapabilityLifetimeSeconds;
export const mediaProcessingLifetimeSeconds =
  recipeImageProcessingCapabilityLifetimeSeconds;

const identitySchema = z.object({
  householdId: z.uuid(),
  mediaId: z.uuid(),
  // Storage provenance is independent of the attachment authorizing this request.
  // null denotes the new feature-neutral layout. Legacy objects never move.
  storageRecipeId: z.uuid().nullable(),
  moduleKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  parentId: z.uuid(),
  attachmentId: z.uuid(),
});
export type MediaIdentity = z.infer<typeof identitySchema>;
export const mediaReadCapabilitySchema = identitySchema
  .extend({
    expiresAt: z.number().int().positive(),
    variant: z.enum(mediaImageVariants),
  })
  .strict();
export const mediaProcessingCapabilitySchema = identitySchema
  .extend({
    expiresAt: z.number().int().positive(),
    contentType: stillImageContentTypeSchema,
    byteSize: z.number().int().positive().max(maxStillImageByteSize),
  })
  .strict();
export type MediaReadCapability = z.infer<typeof mediaReadCapabilitySchema>;
export type MediaProcessingCapability = z.infer<
  typeof mediaProcessingCapabilitySchema
>;

export function mediaOriginalObjectKey(
  identity: Pick<MediaIdentity, "householdId" | "mediaId" | "storageRecipeId">,
): string {
  const prefix = `households/${identity.householdId}`;
  return identity.storageRecipeId === null
    ? `${prefix}/media/${identity.mediaId}`
    : `${prefix}/recipes/${identity.storageRecipeId}/${identity.mediaId}`;
}

export function mediaStorageIdentity({
  householdId,
  mediaId,
  objectKey,
}: {
  householdId: string;
  mediaId: string;
  objectKey: string;
}): Pick<MediaIdentity, "householdId" | "mediaId" | "storageRecipeId"> {
  const identity = {
    householdId,
    mediaId,
    storageRecipeId: null as string | null,
  };
  if (mediaOriginalObjectKey(identity) === objectKey) return identity;
  const legacyRecipeId = objectKey.split("/")[3];
  const parsedRecipeId = z.uuid().safeParse(legacyRecipeId);
  if (parsedRecipeId.success) {
    identity.storageRecipeId = parsedRecipeId.data;
    if (mediaOriginalObjectKey(identity) === objectKey) return identity;
  }
  throw new Error("Media object key does not match its stored identity");
}

export function mediaDerivativeObjectKey(
  identity: Pick<MediaIdentity, "householdId" | "mediaId" | "storageRecipeId">,
  variant: "thumbnail" | "viewer",
): string {
  return `${mediaOriginalObjectKey(identity)}/derivatives/${variant}.webp`;
}

function payload(
  capability: MediaReadCapability | MediaProcessingCapability,
  purpose: "read" | "process",
): string {
  // Canonical, unambiguous fields; never sign a caller's object serialization/order.
  const identity = [
    capability.householdId,
    capability.mediaId,
    capability.storageRecipeId,
    capability.moduleKey,
    capability.parentId,
    capability.attachmentId,
    capability.expiresAt,
  ];
  return JSON.stringify([
    `home-hub-media-${purpose}-v2`,
    ...identity,
    ...("variant" in capability
      ? [capability.variant]
      : [capability.contentType, capability.byteSize]),
  ]);
}

async function key(secret: string) {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32)
    throw new Error("Media signing secret must be at least 32 bytes");
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signMediaCapability({
  capability,
  purpose,
  secret,
}: {
  capability: MediaReadCapability | MediaProcessingCapability;
  purpose: "read" | "process";
  secret: string;
}): Promise<string> {
  const parsed =
    purpose === "read"
      ? mediaReadCapabilitySchema.parse(capability)
      : mediaProcessingCapabilitySchema.parse(capability);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    new TextEncoder().encode(payload(parsed, purpose)),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyMediaCapability({
  capability,
  purpose,
  secret,
  signature,
  nowSeconds,
}: {
  capability: MediaReadCapability | MediaProcessingCapability;
  purpose: "read" | "process";
  secret: string;
  signature: string;
  nowSeconds: number;
}): Promise<boolean> {
  const parsed = (
    purpose === "read"
      ? mediaReadCapabilitySchema
      : mediaProcessingCapabilitySchema
  ).safeParse(capability);
  const lifetime =
    purpose === "read"
      ? mediaReadLifetimeSeconds
      : mediaProcessingLifetimeSeconds;
  if (
    !parsed.success ||
    parsed.data.expiresAt <= nowSeconds ||
    parsed.data.expiresAt > nowSeconds + lifetime + 5 ||
    !/^[a-f0-9]{64}$/u.test(signature)
  )
    return false;
  const bytes = new Uint8Array(
    signature.match(/../gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
  return crypto.subtle.verify(
    "HMAC",
    await key(secret),
    bytes,
    new TextEncoder().encode(payload(parsed.data, purpose)),
  );
}

export function mediaReadUrl({
  baseUrl,
  capability,
  signature,
}: {
  baseUrl: string;
  capability: MediaReadCapability;
  signature: string;
}): string {
  const url = new URL(
    "media/images",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  // The complete capability is signed, including storage provenance and context.
  url.searchParams.set("capability", JSON.stringify(capability));
  url.searchParams.set("signature", signature);
  return url.toString();
}
