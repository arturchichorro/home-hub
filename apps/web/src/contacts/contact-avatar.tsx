import type { ContactMediaImage } from "@home-hub/shared/contact-media";
import { useMediaSession } from "../media/session";
import { useContactImageUrl } from "./contact-image-url";

export function ContactAvatar({
  householdId,
  contactId,
  name,
  image,
}: {
  householdId: string;
  contactId: string;
  name: string;
  image?: ContactMediaImage | undefined;
}) {
  const session = useMediaSession();
  if (!session) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-xs text-muted">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    <AvatarImage
      session={session}
      householdId={householdId}
      contactId={contactId}
      name={name}
      image={image}
    />
  );
}

function AvatarImage({
  session,
  householdId,
  contactId,
  name,
  image,
}: {
  session: NonNullable<ReturnType<typeof useMediaSession>>;
  householdId: string;
  contactId: string;
  name: string;
  image?: ContactMediaImage | undefined;
}) {
  const state = useContactImageUrl({
    ...session,
    householdId,
    kind: "profile",
    itemId: contactId,
    attachmentId: image?.id,
    variant: "thumbnail",
  });
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-xs text-muted">
      {state.url ? (
        <img
          src={state.url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        name
          .split(/\s+/)
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}
