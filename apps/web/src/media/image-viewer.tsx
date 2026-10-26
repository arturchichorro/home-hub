import {
  ChevronLeft,
  ChevronRight,
  ConfirmationPopover,
  DialogClose,
  DialogPopup,
  DialogRoot,
  IconButton,
  InlineAlert,
  Trash2,
  X,
} from "@home-hub/ui-web";
import { useState } from "react";

export type DisplayImage = {
  id: string;
  width: number | null;
  height: number | null;
};
export function ImageViewer<Image extends DisplayImage>({
  image,
  images,
  thumbnailUrl,
  viewerUrl,
  error,
  alt,
  canDelete,
  deleting,
  deleteDescription,
  actionError,
  onSelect,
  onDelete,
  onOpenChange,
}: {
  image: Image | undefined;
  images: readonly Image[];
  thumbnailUrl: string | undefined;
  viewerUrl: string | undefined;
  error: boolean;
  alt: string;
  canDelete: boolean;
  deleting: boolean;
  deleteDescription: string;
  actionError: string | undefined;
  onSelect: (image: Image) => void;
  onDelete: (image: Image) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const loaded = viewerUrl !== undefined && viewerUrl === loadedUrl;
  const navigate = (direction: number) => {
    if (!image || images.length < 2) return;
    const index = images.findIndex((item) => item.id === image.id);
    if (index < 0) return;
    const next = images[(index + direction + images.length) % images.length];
    if (next) onSelect(next);
  };
  return (
    <DialogRoot open={Boolean(image)} onOpenChange={onOpenChange}>
      <DialogPopup
        appearance="bare"
        title="Image preview"
        size="large"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            navigate(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <DialogClose
          aria-label="Close image preview"
          className="fixed! top-4 left-4 z-10 size-10! rounded-full p-0!"
        >
          <X aria-hidden="true" />
        </DialogClose>
        {image && canDelete && (
          <ConfirmationPopover
            title="Delete picture?"
            description={deleteDescription}
            trigger={
              <IconButton
                aria-label="Delete picture"
                className="fixed! top-4 right-4 z-10 rounded-full"
                variant="secondary"
                disabled={deleting}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            }
            onConfirm={() => {
              if (!deleting) onDelete(image);
            }}
          />
        )}
        {viewerUrl || thumbnailUrl ? (
          <div className="relative">
            {viewerUrl && (
              <img
                src={viewerUrl}
                alt={alt}
                width={image?.width ?? undefined}
                height={image?.height ?? undefined}
                className={[
                  "max-h-[90vh] w-full object-contain transition-opacity duration-200",
                  loaded ? "opacity-100" : "opacity-0",
                ].join(" ")}
                onLoad={() => setLoadedUrl(viewerUrl)}
              />
            )}
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt={viewerUrl ? "" : alt}
                width={image?.width ?? undefined}
                height={image?.height ?? undefined}
                className={[
                  viewerUrl ? "absolute inset-0" : "",
                  "max-h-[90vh] w-full object-contain transition-opacity duration-200",
                  loaded ? "opacity-0" : "opacity-100",
                ].join(" ")}
              />
            )}
          </div>
        ) : error ? (
          <InlineAlert role="alert" variant="danger">
            This image is not currently available.
          </InlineAlert>
        ) : (
          <div className="aspect-video animate-pulse rounded-md bg-surface" />
        )}
        {actionError && (
          <InlineAlert
            role="alert"
            variant="danger"
            className="fixed! bottom-4 left-4 right-4 z-10"
          >
            {actionError}
          </InlineAlert>
        )}
        {images.length > 1 && (
          <>
            <IconButton
              aria-label="Previous image"
              className="fixed! top-1/2 left-4 z-10 -translate-y-1/2 rounded-full"
              variant="secondary"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </IconButton>
            <IconButton
              aria-label="Next image"
              className="fixed! top-1/2 right-4 z-10 -translate-y-1/2 rounded-full"
              variant="secondary"
              onClick={() => navigate(1)}
            >
              <ChevronRight aria-hidden="true" />
            </IconButton>
          </>
        )}
      </DialogPopup>
    </DialogRoot>
  );
}
