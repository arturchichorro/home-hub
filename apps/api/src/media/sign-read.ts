import {
  type MediaIdentity,
  type MediaReadCapability,
  mediaReadLifetimeSeconds,
  mediaReadUrl,
  signMediaCapability,
} from "@home-hub/shared/media-delivery";

export async function signMediaRead({
  baseUrl,
  identity,
  now = new Date(),
  secret,
  variant,
}: {
  baseUrl: string;
  identity: MediaIdentity;
  now?: Date;
  secret: string;
  variant: MediaReadCapability["variant"];
}): Promise<string> {
  const capability = {
    ...identity,
    variant,
    expiresAt: Math.floor(now.getTime() / 1_000) + mediaReadLifetimeSeconds,
  };
  return mediaReadUrl({
    baseUrl,
    capability,
    signature: await signMediaCapability({
      capability,
      purpose: "read",
      secret,
    }),
  });
}
