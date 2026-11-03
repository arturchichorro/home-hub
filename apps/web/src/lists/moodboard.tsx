import { DragDropProvider } from "@dnd-kit/react";
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
import { useState } from "react";
import { type MediaSession, useMediaSession } from "../media/session";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { listOrderingSensors } from "./list-card";
import { deleteListImage } from "./list-media-api";
import { invalidateListImageUrl, useListImageUrl } from "./list-media-url";
import { type MoodboardPin, MoodboardThumbnail } from "./moodboard-preview";
import { MoodboardUploads } from "./moodboard-uploads";

function Tile({
  pin,
  index,
  session,
  disabled,
  onOpen,
}: {
  pin: MoodboardPin;
  index: number;
  session: MediaSession;
  disabled: boolean;
  onOpen: () => void;
}) {
  const sortable = useSortable({
    id: pin.id,
    index,
    type: "moodboard-media",
    accept: "moodboard-media",
    disabled,
  });
  return (
    <li
      ref={sortable.ref}
      className={`relative mb-3 break-inside-avoid overflow-hidden rounded-lg bg-raised ${sortable.isDragging ? "opacity-50" : ""}`}
      data-moodboard-pin={pin.id}
    >
      <button
        type="button"
        draggable={false}
        onClick={onOpen}
        aria-label={`Open ${pin.asset?.kind === "video" ? "video" : "image"} ${index + 1}`}
        className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-focus-ring"
        style={{
          aspectRatio: `${pin.asset?.width ?? 1}/${pin.asset?.height ?? 1}`,
        }}
      >
        <MoodboardThumbnail pin={pin} session={session} />
        {pin.asset?.kind === "video" && (
          <span className="absolute bottom-2 left-2 rounded-full bg-canvas/80 p-2">
            <Play className="size-4" aria-hidden="true" />
          </span>
        )}
      </button>
      <IconButton
        ref={sortable.handleRef}
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
  index,
  total,
  session,
  enabled,
  onClose,
  onMove,
  onDelete,
}: {
  pin: MoodboardPin;
  index: number;
  total: number;
  session: MediaSession;
  enabled: boolean;
  onClose: () => void;
  onMove: (n: number) => void;
  onDelete: () => Promise<void>;
}) {
  useBlockAppUpdate(true);
  const [deleting, setDeleting] = useState(false),
    [error, setError] = useState(false),
    [loadedImage, setLoadedImage] = useState<string>();
  const identity = {
    ...session,
    householdId: pin.householdId,
    listId: pin.listId,
  };
  const poster = useListImageUrl({
      ...identity,
      attachmentId: pin.id,
      variant: "thumbnail",
    }),
    full = useListImageUrl({
      ...identity,
      attachmentId: pin.id,
      variant: pin.asset?.kind === "video" ? "video" : "viewer",
    });
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <DialogPopup
        title={`Media ${index + 1} of ${total}`}
        size="large"
        actions={
          <>
            <Button
              variant="ghost"
              disabled={index === 0 || deleting}
              onClick={() => onMove(-1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={index >= total - 1 || deleting}
              onClick={() => onMove(1)}
            >
              Next
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={onClose}>
              Close
            </Button>
            <ConfirmationPopover
              message="Remove this media from the moodboard?"
              confirmLabel="Remove"
              trigger={
                <IconButton
                  aria-label="Remove media"
                  disabled={!enabled || deleting}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </IconButton>
              }
              onConfirm={() => {
                setDeleting(true);
                setError(false);
                void onDelete()
                  .catch(() => setError(true))
                  .finally(() => setDeleting(false));
              }}
            />
          </>
        }
      >
        {pin.asset?.kind === "video" ? (
          <video
            key={pin.id}
            controls
            playsInline
            preload="metadata"
            poster={poster.url}
            src={full.url}
            className="mx-auto max-h-[65vh] max-w-full"
            aria-label="Moodboard video"
            onError={() => setError(true)}
          >
            <track kind="captions" />
          </video>
        ) : (
          <div
            className="grid place-items-center"
            role="img"
            aria-label="Moodboard inspiration"
          >
            {poster.url && (
              <img
                src={poster.url}
                alt=""
                width={pin.asset?.width}
                height={pin.asset?.height}
                className={`col-start-1 row-start-1 mx-auto max-h-[65vh] max-w-full object-contain ${loadedImage === full.url ? "opacity-0" : "opacity-100"}`}
              />
            )}
            {full.url && (
              <img
                src={full.url}
                alt=""
                width={pin.asset?.width}
                height={pin.asset?.height}
                className={`col-start-1 row-start-1 mx-auto max-h-[65vh] max-w-full object-contain transition-opacity duration-200 ${loadedImage === full.url ? "opacity-100" : "opacity-0"}`}
                onLoad={(event) =>
                  setLoadedImage(event.currentTarget.currentSrc)
                }
                onError={() => setError(true)}
              />
            )}
          </div>
        )}
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
  count,
  onBusy,
}: {
  householdId: string;
  listId: string;
  count: number;
  onBusy: (busy: boolean) => void;
}) {
  const session = useMediaSession(),
    zero = useZero(),
    enabled = useZeroMutationEnabled();
  const [limit, setLimit] = useState(51),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState<string>(),
    [dragging, setDragging] = useState(false),
    [reordering, setReordering] = useState(false);
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
  const viewerRows =
    selectedRow && !visible.some((row) => row.id === selectedRow.id)
      ? [...visible, selectedRow]
      : visible;
  const current = selectedRow ?? visible.find((r) => r.id === selected),
    index = viewerRows.findIndex((r) => r.id === selected);
  async function move(from: number, to: number) {
    if (!enabled || from === to || to < 0 || to >= visible.length) return;
    const order = [...visible],
      moved = order.splice(from, 1)[0];
    if (!moved) return;
    order.splice(to, 0, moved);
    setReordering(true);
    setError(undefined);
    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.reorderMedia({
            householdId,
            listId,
            attachmentId: moved.id,
            previousId: order[to - 1]?.id ?? null,
            nextId: order[to + 1]?.id ?? null,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (result.type === "error") throw Error("reorder");
    } catch {
      setError(
        "Unable to save media order. The confirmed order has been restored.",
      );
    } finally {
      setReordering(false);
    }
  }
  if (!session)
    return (
      <p className="text-muted">Sign in online to load moodboard media.</p>
    );
  return (
    <section aria-label="Moodboard" className="grid gap-4">
      <MoodboardUploads
        householdId={householdId}
        listId={listId}
        session={session}
        onBusy={onBusy}
      />
      <p className="text-xs text-muted">
        {count} {count === 1 ? "media item" : "media items"}
      </p>
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
        <p className="py-12 text-center text-muted" role="status">
          {result.type === "complete"
            ? "Add images or video clips to start your moodboard."
            : "Loading media…"}
        </p>
      )}
      <DragDropProvider
        sensors={listOrderingSensors}
        onDragStart={() => setDragging(true)}
        onDragEnd={(event) => {
          setDragging(false);
          const source = event.operation.source;
          if (!event.canceled && isSortable(source))
            void move(source.initialIndex, source.index);
        }}
      >
        <ul
          aria-label="Moodboard media"
          className="columns-2 gap-3 sm:columns-3 lg:columns-4"
        >
          {visible.map((pin, i) => (
            <Tile
              key={pin.id}
              pin={pin}
              index={i}
              session={session}
              disabled={!enabled || reordering}
              onOpen={() => setSelected(pin.id)}
            />
          ))}
        </ul>
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
          key={current.id}
          pin={current}
          index={index}
          total={viewerRows.length}
          session={session}
          enabled={enabled}
          onClose={() => setSelected(undefined)}
          onMove={(direction) => setSelected(viewerRows[index + direction]?.id)}
          onDelete={async () => {
            const result = await deleteListImage({
              ...session,
              householdId,
              listId,
              attachmentId: current.id,
            });
            if (result.kind === "unauthorized") session.onSessionExpired();
            if (result.kind !== "success") throw Error("delete");
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
