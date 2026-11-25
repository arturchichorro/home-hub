import {
  type ContactMediaImage,
  contactImagesFromRows,
} from "@home-hub/shared/contact-media";
import {
  maxStillImageByteSize,
  stillImageContentTypeSchema,
  stillImageUploadSchema,
} from "@home-hub/shared/media";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, ErrorPopover, ImagePlus } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ImageViewer } from "../media/image-viewer";
import { readImageDimensions } from "../media/read-image-dimensions";
import { removeAttachment } from "../media/remove-attachment";
import { type MediaSession, useMediaSession } from "../media/session";
import { blockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  invalidateContactImageUrl,
  prefetchContactImage,
  useContactImageUrl,
} from "./contact-image-url";
import {
  confirmContactImage,
  requestContactImageUpload,
} from "./contact-media-api";

type Slots = { upload: ReactNode; gallery: ReactNode };

type Props = {
  kind: "profile" | "entry";
  prepare?: () => Promise<boolean>;
  householdId: string;
  itemId: string;
  name: string;
  saved: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  children: (slots: Slots) => ReactNode;
};

export function ContactMedia(props: Props) {
  const session = useMediaSession();

  return session ? (
    <ContactMediaContent {...props} session={session} />
  ) : (
    props.children({ upload: null, gallery: null })
  );
}

function ContactThumbnail({
  kind,
  image,
  session,
  name,
  onOpen,
}: {
  image: ContactMediaImage;
  kind: "profile" | "entry";
  session: MediaSession;
  name: string;
  onOpen: () => void;
}) {
  const state = useContactImageUrl({
    ...session,
    kind,
    householdId: image.householdId,
    itemId: image.itemId,
    attachmentId: image.id,
    variant: "thumbnail",
  });

  return (
    <li
      className={`shrink-0 overflow-hidden bg-raised ${kind === "profile" ? "size-16 rounded-full" : "size-12 rounded-lg"}`}
    >
      <button
        type="button"
        aria-label={`Open picture for ${name}`}
        className="size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-focus-ring"
        onClick={onOpen}
      >
        {state.url ? (
          <img
            src={state.url}
            alt=""
            width={image.width}
            height={image.height}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span
            role="img"
            className="block size-full"
            aria-label={state.error ? "Picture unavailable" : "Loading picture"}
          />
        )}
      </button>
    </li>
  );
}

function ContactMediaContent({
  kind,
  prepare,
  householdId,
  itemId,
  name,
  saved,
  disabled,
  onBusyChange,
  children,
  session,
}: Props & { session: MediaSession }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [rows, result] = useQuery(
    saved ? queries.contacts.media({ householdId, itemId, kind }) : undefined,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const work = useRef(false);
  const callback = useRef(onBusyChange);
  callback.current = onBusyChange;

  function notify(active: boolean) {
    work.current = active;
    callback.current(active);
  }

  useEffect(() => () => callback.current(false), []);
  const images = contactImagesFromRows(rows ?? []);
  const selected = images.find((image) => image.id === selectedId);
  const writable =
    enabled &&
    (saved || Boolean(prepare)) &&
    !disabled &&
    !work.current &&
    (!saved || result.type === "complete");
  const thumbnail = useContactImageUrl({
    ...session,
    kind,
    householdId,
    itemId,
    attachmentId: selected?.id,
    variant: "thumbnail",
  });
  const viewer = useContactImageUrl({
    ...session,
    kind,
    householdId,
    itemId,
    attachmentId: selected?.id,
    variant: "viewer",
  });

  useEffect(() => {
    if (!selectedId || !viewer.url || images.length < 2) {
      return;
    }

    const index = images.findIndex((image) => image.id === selectedId);

    for (const direction of [-1, 1]) {
      const next = images[(index + direction + images.length) % images.length];

      if (next) {
        void prefetchContactImage({
          ...session,
          kind,
          householdId,
          itemId,
          attachmentId: next.id,
          variant: "viewer",
        }).catch(() => undefined);
      }
    }
  }, [selectedId, viewer.url, images, session, householdId, itemId, kind]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || busy || !writable) {
      return;
    }

    const allowUpdate = blockAppUpdate();
    setBusy(true);
    notify(true);
    setError(undefined);

    try {
      const type = stillImageContentTypeSchema.safeParse(file.type);

      if (!type.success) {
        setError("Choose a still JPEG, PNG or WebP image.");

        return;
      }

      if (file.size > maxStillImageByteSize) {
        setError("Choose an image up to 10 MiB.");

        return;
      }

      const dimensions = await readImageDimensions(file);
      const metadata = stillImageUploadSchema.safeParse({
        contentType: type.data,
        byteSize: file.size,
        ...dimensions,
      });

      if (!metadata.success) {
        setError("Choose an image up to 16,384 pixels per side.");

        return;
      }

      if (prepare && !(await prepare())) {
        throw Error("Resolve unsaved fields before uploading");
      }
      const pending = await requestContactImageUpload({
        accessToken: session.accessToken,
        kind,
        householdId,
        itemId,
        ...metadata.data,
      });

      if (pending.kind === "unauthorized") {
        session.onSessionExpired();

        return;
      }

      if (pending.kind !== "success") {
        throw new Error("Upload denied");
      }

      const uploaded = await fetch(pending.upload.url, {
        method: "PUT",
        headers: pending.upload.requiredHeaders,
        body: file,
      });

      if (!uploaded.ok) {
        throw new Error("Upload failed");
      }

      const confirmed = await confirmContactImage({
        accessToken: session.accessToken,
        kind,
        householdId,
        itemId,
        attachmentId: pending.attachmentId,
      });

      if (confirmed.kind === "unauthorized") {
        session.onSessionExpired();
      } else if (confirmed.kind === "invalid_upload") {
        setError(
          "This image is invalid or animated. Choose a still JPEG, PNG or WebP image.",
        );
      } else if (confirmed.kind !== "success") {
        throw new Error("Confirmation failed");
      }
    } catch {
      setError("Unable to upload this picture. Try again.");
    } finally {
      allowUpdate();
      setBusy(false);
      notify(false);
    }
  }

  async function remove(image: ContactMediaImage) {
    if (!writable || deleting) {
      return;
    }

    if (prepare && !(await prepare())) {
      return;
    }
    setDeleting(true);
    notify(true);
    const allowUpdate = blockAppUpdate();
    setDeleteError(undefined);

    try {
      const result = await removeAttachment(zero, {
        kind: kind === "profile" ? "contact-profile" : "contact-entry",
        householdId,
        parentId: itemId,
        attachmentId: image.id,
      });

      if (result.kind === "unauthorized") {
        session.onSessionExpired();

        return;
      }

      if (result.kind !== "success") {
        throw new Error("Delete failed");
      }

      invalidateContactImageUrl({
        ...session,
        kind,
        householdId,
        itemId,
        attachmentId: image.id,
      });
      setSelectedId(undefined);
    } catch {
      setDeleteError(
        "Unable to remove this picture. If it is the last content, use Delete entry everywhere.",
      );
    } finally {
      setDeleting(false);
      allowUpdate();
      notify(false);
    }
  }

  return children({
    upload: (
      <>
        <Button
          ref={button}
          variant="ghost"
          size="compact"
          className="size-7! shrink-0 p-0!"
          aria-label={`Add picture for ${name || "contact item"}`}
          title="Add picture"
          busy={busy}
          disabled={!writable || busy || deleting}
          onClick={() => {
            const fileInput = input.current;
            if (!fileInput || !writable) {
              return;
            }
            try {
              fileInput.showPicker();
            } catch {
              fileInput.click();
            }
          }}
        >
          <ImagePlus aria-hidden="true" className="size-4" />
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          tabIndex={-1}
          onChange={(event) => void upload(event)}
        />
        <ErrorPopover
          anchor={button}
          open={Boolean(error)}
          onDismiss={() => setError(undefined)}
        >
          {error}
        </ErrorPopover>
      </>
    ),
    gallery: (
      <>
        {images.length > 0 && (
          <ul
            aria-label={`Pictures for ${name}`}
            className="mt-1 mb-2 flex w-full max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain"
          >
            {images.map((image) => (
              <ContactThumbnail
                key={image.id}
                kind={kind}
                image={image}
                session={session}
                name={name}
                onOpen={() => {
                  setDeleteError(undefined);
                  setSelectedId(image.id);
                }}
              />
            ))}
          </ul>
        )}
        <ImageViewer
          image={selected}
          images={images}
          thumbnailUrl={thumbnail.url}
          viewerUrl={viewer.url}
          error={viewer.error}
          alt={name}
          canDelete={writable && !busy}
          deleting={deleting}
          actionError={deleteError}
          deleteDescription="This removes the picture for everyone. If it is the entry’s last content, delete the entry instead."
          onSelect={(image) => {
            setDeleteError(undefined);
            setSelectedId(image.id);
          }}
          onDelete={(image) => void remove(image)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedId(undefined);
            }
          }}
        />
      </>
    ),
  });
}
