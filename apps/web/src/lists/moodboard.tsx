import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  DialogPopup,
  DialogRoot,
  GripVertical,
  IconButton,
  InlineAlert,
  Play,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { ImageViewer } from "../media/image-viewer";
import { type MediaSession, useMediaSession } from "../media/session";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { listOrderingSensors } from "./list-card";
import { deleteListImage } from "./list-media-api";
import { invalidateListImageUrl, useListImageUrl } from "./list-media-url";
import { MoodboardLayout } from "./moodboard-layout";
import { applyMoodboardOrder, moveMoodboardPin } from "./moodboard-order";
import { type MoodboardPin, MoodboardThumbnail } from "./moodboard-preview";
import { MoodboardUploads } from "./moodboard-uploads";

// React owns the preview order and tile parents. Keep keyboard navigation, but
// do not let OptimisticSortingPlugin independently mutate that same DOM order.
const moodboardSortingPlugins = [SortableKeyboardPlugin];

function Tile({
  pin,
  index,
  session,
  disabled,
  onOpen,
  style,
}: {
  pin: MoodboardPin;
  index: number;
  session: MediaSession;
  disabled: boolean;
  onOpen: () => void;
  style: CSSProperties;
}) {
  const sortable = useSortable({
    id: pin.id,
    index,
    type: "moodboard-media",
    accept: "moodboard-media",
    disabled,
    plugins: moodboardSortingPlugins,
    transition: null,
  });

  return (
    <li
      ref={sortable.ref}
      style={style}
      className={`relative mb-3 break-inside-avoid overflow-hidden rounded-sm bg-raised transition-[translate] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none ${sortable.isDragging ? "opacity-50" : ""}`}
      data-moodboard-pin={pin.id}
    >
      <button
        type="button"
        draggable={false}
        onClick={onOpen}
        aria-label={`Open ${pin.asset?.kind === "video" ? "video" : "image"} ${index + 1}`}
        className="relative block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-focus-ring"
        style={{
          aspectRatio: `${pin.asset?.width ?? 1}/${pin.asset?.height ?? 1}`,
        }}
      >
        <span className="absolute inset-0">
          <MoodboardThumbnail pin={pin} session={session} cover />
        </span>
        {pin.asset?.kind === "video" && (
          <span className="absolute bottom-2 left-2 rounded-sm bg-canvas/80 p-2">
            <Play className="size-4" aria-hidden="true" />
          </span>
        )}
      </button>
      <IconButton
        ref={sortable.handleRef}
        data-moodboard-handle
        disabled={disabled}
        aria-label={`Move media ${index + 1}`}
        title="Drag to reorder, or press Space and arrow keys"
        className="absolute! top-1 right-1 size-11! touch-none bg-canvas/80"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </IconButton>
    </li>
  );
}

function Viewer({
  pin,
  pins,
  session,
  enabled,
  onClose,
  onSelect,
  onDelete,
}: {
  pin: MoodboardPin;
  pins: readonly MoodboardPin[];
  session: MediaSession;
  enabled: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: () => Promise<void>;
}) {
  useBlockAppUpdate(true);

  const [deleting, setDeleting] = useState(false);
  const [errorFor, setErrorFor] = useState<string>();
  const error = errorFor === pin.id;
  const index = pins.findIndex((item) => item.id === pin.id);
  const identity = {
    ...session,
    householdId: pin.householdId,
    listId: pin.listId,
  };
  const poster = useListImageUrl({
    ...identity,
    attachmentId: pin.id,
    variant: "thumbnail",
  });
  const full = useListImageUrl({
    ...identity,
    attachmentId: pin.id,
    variant: pin.asset?.kind === "video" ? "video" : "viewer",
  });

  function remove() {
    if (deleting || !enabled) {
      return;
    }

    setDeleting(true);
    setErrorFor(undefined);
    void onDelete()
      .catch(() => setErrorFor(pin.id))
      .finally(() => setDeleting(false));
  }

  if (pin.asset?.kind !== "video") {
    const images = pins.map((item) => ({
      id: item.id,
      width: item.asset?.width ?? null,
      height: item.asset?.height ?? null,
    }));

    return (
      <ImageViewer
        image={images.find((item) => item.id === pin.id)}
        images={images}
        thumbnailUrl={poster.url}
        viewerUrl={full.url}
        error={full.error}
        alt="Moodboard image"
        canDelete={enabled}
        deleting={deleting}
        deleteDescription="Remove this picture from the moodboard."
        actionError={
          error ? "Unable to remove this picture. Please retry." : undefined
        }
        onSelect={(item) => onSelect(item.id)}
        onDelete={remove}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            onClose();
          }
        }}
      />
    );
  }

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !deleting) {
          onClose();
        }
      }}
    >
      <DialogPopup
        title="Video preview"
        size="large"
        actions={
          <>
            <Button
              variant="ghost"
              disabled={index === 0 || deleting}
              onClick={() => {
                const previous = pins[index - 1];

                if (previous) {
                  onSelect(previous.id);
                }
              }}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={index >= pins.length - 1 || deleting}
              onClick={() => {
                const next = pins[index + 1];

                if (next) {
                  onSelect(next.id);
                }
              }}
            >
              Next
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={onClose}>
              Close
            </Button>
            <ConfirmationPopover
              message="Remove this video from the moodboard?"
              confirmLabel="Remove"
              trigger={
                <IconButton
                  aria-label="Remove media"
                  disabled={!enabled || deleting}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </IconButton>
              }
              onConfirm={remove}
            />
          </>
        }
      >
        <video
          key={pin.id}
          controls
          playsInline
          preload="metadata"
          poster={poster.url}
          src={full.url}
          className="mx-auto max-h-[65vh] max-w-full"
          aria-label="Moodboard video"
          onError={() => setErrorFor(pin.id)}
        >
          <track kind="captions" />
        </video>
        {(error || full.error) && (
          <InlineAlert role="alert" variant="danger">
            Unable to load or remove this media. Close and reopen to retry.
          </InlineAlert>
        )}
      </DialogPopup>
    </DialogRoot>
  );
}

export function Moodboard({
  householdId,
  listId,
  onBusy,
}: {
  householdId: string;
  listId: string;
  onBusy: (busy: boolean) => void;
}) {
  const session = useMediaSession();
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const container = useRef<HTMLElement>(null);
  const keyboardDragPin = useRef<string | undefined>(undefined);
  const [focusAfterReorder, setFocusAfterReorder] = useState<string>();
  const [limit, setLimit] = useState(51);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<readonly string[]>();
  const previewOrderRef = useRef<readonly string[] | undefined>(undefined);
  const [rows, result] = useQuery(
    queries.lists.mediaPage({ householdId, listId, limit }),
  );
  const [selectedRow] = useQuery(
    selected
      ? queries.lists.mediaById({ householdId, listId, attachmentId: selected })
      : undefined,
  );
  useBlockAppUpdate(dragging || reordering);

  const visible = rows.slice(0, limit - 1);
  const displayed = applyMoodboardOrder(visible, previewOrder);
  const pinned = selectedRow?.id === selected ? selectedRow : undefined;
  const viewerRows =
    pinned && !visible.some((row) => row.id === pinned.id)
      ? [...visible, pinned]
      : visible;
  const current = pinned ?? visible.find((row) => row.id === selected);

  useLayoutEffect(() => {
    if (!focusAfterReorder || reordering) {
      return;
    }

    // A moved pin can change columns. Restore its handle after it is enabled,
    // unless the user has already focused a different control while saving.
    const active = document.activeElement;
    const focusedPin = active
      ?.closest("[data-moodboard-pin]")
      ?.getAttribute("data-moodboard-pin");

    if (
      active === document.body ||
      active === document.documentElement ||
      focusedPin === focusAfterReorder
    ) {
      container.current
        ?.querySelector<HTMLElement>(
          `[data-moodboard-pin="${CSS.escape(focusAfterReorder)}"] [data-moodboard-handle]`,
        )
        ?.focus({ preventScroll: true });
    }

    setFocusAfterReorder(undefined);
  }, [focusAfterReorder, reordering]);

  function clearPreview() {
    previewOrderRef.current = undefined;
    setPreviewOrder(undefined);
  }

  async function move(attachmentId: string, order: readonly MoodboardPin[]) {
    const to = order.findIndex((pin) => pin.id === attachmentId);
    const unchanged = order.every(
      (pin, index) => pin.id === visible[index]?.id,
    );

    if (!enabled || to < 0 || unchanged) {
      clearPreview();

      return;
    }

    setReordering(true);
    setError(undefined);

    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.reorderMedia({
            householdId,
            listId,
            attachmentId,
            previousId: order[to - 1]?.id ?? null,
            nextId: order[to + 1]?.id ?? null,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );

      if (result.type === "error") {
        throw Error("reorder");
      }
    } catch {
      setError(
        "Unable to save media order. The confirmed order has been restored.",
      );
    } finally {
      clearPreview();
      setReordering(false);
    }
  }

  if (!session) {
    return (
      <p className="text-muted">Sign in online to load moodboard media.</p>
    );
  }

  return (
    <section
      ref={container}
      onKeyDownCapture={(event) => {
        if (
          event.code === "Space" &&
          event.target instanceof Element &&
          event.target.hasAttribute("data-moodboard-handle")
        ) {
          keyboardDragPin.current =
            event.target
              .closest("[data-moodboard-pin]")
              ?.getAttribute("data-moodboard-pin") ?? undefined;
        }
      }}
      onPointerDownCapture={() => {
        keyboardDragPin.current = undefined;
      }}
      aria-label="Moodboard"
      className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 overflow-x-clip"
    >
      <MoodboardUploads
        householdId={householdId}
        listId={listId}
        session={session}
        onBusy={onBusy}
      />
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {result.type === "error" && (
        <InlineAlert role="alert" variant="danger">
          Unable to load media. Previously loaded media remains visible.
        </InlineAlert>
      )}
      {!rows.length && (
        <p className="sr-only" role="status">
          {result.type === "complete" ? "Empty moodboard" : "Loading media…"}
        </p>
      )}
      <DragDropProvider
        sensors={listOrderingSensors}
        onDragStart={() => {
          const order = visible.map((pin) => pin.id);
          previewOrderRef.current = order;
          setPreviewOrder(order);
          setDragging(true);
        }}
        onDragOver={(event) => {
          const { source, target } = event.operation;

          if (
            !isSortable(source) ||
            !isSortable(target) ||
            source.id === target.id
          ) {
            return;
          }

          event.preventDefault();

          const order = applyMoodboardOrder(
            visible,
            previewOrderRef.current,
          ).map((pin) => pin.id);
          const next = moveMoodboardPin(
            order,
            String(source.id),
            String(target.id),
          );
          previewOrderRef.current = next;
          setPreviewOrder(next);
        }}
        onDragEnd={(event) => {
          setDragging(false);

          const source = event.operation.source;

          setFocusAfterReorder(keyboardDragPin.current);
          keyboardDragPin.current = undefined;

          if (event.canceled || !isSortable(source)) {
            clearPreview();

            return;
          }

          void move(
            String(source.id),
            applyMoodboardOrder(visible, previewOrderRef.current),
          );
        }}
      >
        <MoodboardLayout
          pins={displayed}
          deferDomOrder={dragging || reordering}
        >
          {(pin, index, style) => (
            <Tile
              key={pin.id}
              style={style}
              pin={pin}
              index={index}
              session={session}
              disabled={!enabled || reordering}
              onOpen={() => setSelected(pin.id)}
            />
          )}
        </MoodboardLayout>
        <DragOverlay className="moodboard-drag-overlay overflow-hidden rounded-sm bg-raised opacity-50">
          {(source) => {
            const pin = visible.find((item) => item.id === source.id);

            return pin ? (
              <MoodboardThumbnail pin={pin} session={session} cover />
            ) : null;
          }}
        </DragOverlay>
      </DragDropProvider>
      {rows.length >= limit &&
        (limit < 10001 ? (
          <Button
            variant="ghost"
            onClick={() => setLimit((n) => Math.min(10001, n + 50))}
          >
            Show more media
          </Button>
        ) : (
          <p className="text-muted">Showing the first 10,000 items.</p>
        ))}
      {current && (
        <Viewer
          pin={current}
          pins={viewerRows}
          session={session}
          enabled={enabled}
          onClose={() => setSelected(undefined)}
          onSelect={setSelected}
          onDelete={async () => {
            const result = await deleteListImage({
              ...session,
              householdId,
              listId,
              attachmentId: current.id,
            });

            if (result.kind === "unauthorized") {
              session.onSessionExpired();
            }

            if (result.kind !== "success") {
              throw Error("delete");
            }

            invalidateListImageUrl({
              ...session,
              householdId,
              listId,
              attachmentId: current.id,
            });
            setSelected(undefined);
          }}
        />
      )}
    </section>
  );
}
