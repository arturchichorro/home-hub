import type { Media } from "@home-hub/shared/zero/schema";
import { Play } from "@home-hub/ui-web";
import { useState } from "react";
import { type MediaSession, useMediaSession } from "../media/session";
import { useListImageUrl } from "./list-media-url";
export type MoodboardPin = {
  id: string;
  householdId: string;
  listId: string;
  sortKey?: number | null;
  asset?: Pick<Media, "id" | "kind" | "width" | "height"> | undefined;
};
export function MoodboardThumbnail({
  pin,
  session,
  cover = false,
}: {
  pin: MoodboardPin;
  session: MediaSession;
  cover?: boolean;
}) {
  const state = useListImageUrl({
    ...session,
    householdId: pin.householdId,
    listId: pin.listId,
    attachmentId: pin.id,
    variant: "thumbnail",
  });
  const [failedUrl, setFailedUrl] = useState<string>();
  return state.url && state.url !== failedUrl ? (
    <img
      src={state.url}
      onError={() => setFailedUrl(state.url)}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      width={pin.asset?.width}
      height={pin.asset?.height}
      className={
        cover ? "size-full object-cover" : "h-auto w-full min-w-0 max-w-full"
      }
    />
  ) : (
    <span
      role="img"
      aria-label={
        state.error || failedUrl ? "Media unavailable" : "Loading media"
      }
      className="block size-full min-h-16 bg-raised"
    />
  );
}
export function MoodboardPreview({ pins }: { pins: readonly MoodboardPin[] }) {
  const session = useMediaSession();
  return (
    <div className="grid gap-2">
      <div
        className="grid aspect-4/3 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-sm bg-raised"
        role="img"
        aria-label="Moodboard preview"
      >
        {pins.slice(0, 4).map((pin) => (
          <div key={pin.id} className="relative min-h-0 overflow-hidden">
            {session && (
              <MoodboardThumbnail pin={pin} session={session} cover />
            )}
            {pin.asset?.kind === "video" && (
              <span
                className="absolute right-1 bottom-1 rounded bg-canvas/80 px-1 text-xs"
                role="img"
                aria-label="Video"
              >
                <Play className="size-3" aria-hidden="true" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
