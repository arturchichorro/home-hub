import type { VideoContentType } from "@home-hub/shared/media";
import type { MediaIdentity } from "@home-hub/shared/media-delivery";
import { mediaReadLifetimeSeconds } from "@home-hub/shared/media-delivery";
import {
  signVideoCapability,
  videoReadUrl,
} from "@home-hub/shared/video-delivery";
export async function signVideoRead(input: {
  baseUrl: string;
  secret: string;
  identity: MediaIdentity;
  videoVersion: string;
  contentType: VideoContentType;
}) {
  const capability = {
    ...input.identity,
    moduleKey: "lists" as const,
    videoVersion: input.videoVersion,
    contentType: input.contentType,
    expiresAt: Math.floor(Date.now() / 1000) + mediaReadLifetimeSeconds,
  };
  return videoReadUrl(
    input.baseUrl,
    capability,
    await signVideoCapability(capability, input.secret),
  );
}
