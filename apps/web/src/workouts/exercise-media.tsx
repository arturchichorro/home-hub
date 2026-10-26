import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  type ExerciseMediaImage,
  exerciseImagesFromRows,
} from "@home-hub/shared/exercise-media";
import {
  maxStillImageByteSize,
  stillImageContentTypeSchema,
  stillImageUploadSchema,
} from "@home-hub/shared/media";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { ErrorPopover, IconButton, ImagePlus } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImageViewer } from "../media/image-viewer";
import { type MediaSession, useMediaSession } from "../media/session";
import { readImageDimensions } from "../recipes/read-image-dimensions";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  invalidateExerciseImageUrl,
  prefetchExerciseImage,
  useExerciseImageUrl,
} from "./exercise-image-url";
import {
  confirmExerciseImage,
  deleteExerciseImage,
  requestExerciseImageUpload,
} from "./exercise-media-api";
import { workoutOrderingSensors } from "./workout-list";

type Props = {
  householdId: string;
  exerciseId: string;
  name: string;
  readOnly?: boolean;
  disabled?: boolean;
};
export function ExerciseMedia(props: Props) {
  const session = useMediaSession();
  return session ? <ExerciseMediaGallery {...props} session={session} /> : null;
}
function ExerciseThumbnail({
  image,
  session,
  name,
  onOpen,
  index,
  sortGroup,
  sortingDisabled,
}: {
  index: number;
  sortGroup: string;
  sortingDisabled: boolean;
  image: ExerciseMediaImage;
  session: MediaSession;
  name: string;
  onOpen: () => void;
}) {
  const sortable = useSortable({
    id: image.id,
    index,
    type: sortGroup,
    accept: sortGroup,
    disabled: sortingDisabled,
  });
  const state = useExerciseImageUrl({
    ...session,
    householdId: image.householdId,
    exerciseId: image.exerciseId,
    attachmentId: image.id,
    variant: "thumbnail",
  });
  return (
    <li
      ref={sortable.ref}
      data-exercise-media-attachment-id={image.id}
      className={`size-12 shrink-0 overflow-hidden rounded-lg bg-raised ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <button
        ref={sortable.handleRef}
        type="button"
        draggable={false}
        aria-label={`Open picture for ${name}`}
        title={
          sortingDisabled
            ? undefined
            : "Drag to reorder, or press Space and arrow keys"
        }
        className={`size-full touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-focus-ring ${sortingDisabled ? "cursor-zoom-in" : "cursor-grab active:cursor-grabbing"}`}
        onClick={() => {
          if (!sortable.isDragging) onOpen();
        }}
      >
        {state.url ? (
          <img
            src={state.url}
            draggable={false}
            alt=""
            width={image.width ?? undefined}
            height={image.height ?? undefined}
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
function ExerciseMediaGallery({
  householdId,
  exerciseId,
  name,
  readOnly = false,
  disabled = false,
  session,
}: Props & { session: MediaSession }) {
  const enabled = useZeroMutationEnabled();
  const zero = useZero();
  const [rows, result] = useQuery(
    queries.workouts.exerciseMedia({ householdId, exerciseId }),
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const button = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const images = exerciseImagesFromRows(rows).filter(
    (image) => !hiddenIds.has(image.id),
  );
  const selected = images.find((image) => image.id === selectedId);
  const writable =
    enabled && !disabled && !readOnly && result.type === "complete";
  const sortingDisabled = !writable || busy || deleting || reordering;
  const thumbnail = useExerciseImageUrl({
    ...session,
    householdId,
    exerciseId,
    attachmentId: selected?.id,
    variant: "thumbnail",
  });
  const viewer = useExerciseImageUrl({
    ...session,
    householdId,
    exerciseId,
    attachmentId: selected?.id,
    variant: "viewer",
  });
  // Warm adjacent full-size pictures without touching workout/log form state.
  useEffect(() => {
    if (!selectedId || !viewer.url || images.length < 2) return;
    const index = images.findIndex((image) => image.id === selectedId);
    for (const direction of [-1, 1]) {
      const next = images[(index + direction + images.length) % images.length];
      if (next)
        void prefetchExerciseImage({
          ...session,
          householdId,
          exerciseId,
          attachmentId: next.id,
          variant: "viewer",
        }).catch(() => undefined);
    }
  }, [selectedId, viewer.url, images, session, householdId, exerciseId]);

  async function reorder(attachmentId: string, orderedAttachmentIds: string[]) {
    if (sortingDisabled) return;
    setReordering(true);
    setError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.workouts.reorderExerciseMedia({
          householdId,
          exerciseId,
          attachmentId,
          orderedAttachmentIds,
          optimisticTimestamp: Date.now(),
        }),
      );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") throw new Error("Reorder failed");
    } catch {
      setError("Unable to reorder these pictures. Try again.");
    } finally {
      setReordering(false);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy || !writable) return;
    setBusy(true);
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
      const pending = await requestExerciseImageUpload({
        accessToken: session.accessToken,
        householdId,
        exerciseId,
        ...metadata.data,
      });
      if (pending.kind === "unauthorized") {
        session.onSessionExpired();
        return;
      }
      if (pending.kind !== "success") throw new Error("Upload denied");
      const uploaded = await fetch(pending.upload.url, {
        method: "PUT",
        headers: pending.upload.requiredHeaders,
        body: file,
      });
      if (!uploaded.ok) throw new Error("Upload failed");
      const confirmed = await confirmExerciseImage({
        accessToken: session.accessToken,
        householdId,
        exerciseId,
        attachmentId: pending.attachmentId,
      });
      if (confirmed.kind === "unauthorized") session.onSessionExpired();
      else if (confirmed.kind === "invalid_upload")
        setError(
          "This image is invalid or animated. Choose a still JPEG, PNG or WebP image.",
        );
      else if (confirmed.kind !== "success")
        throw new Error("Confirmation failed");
    } catch {
      setError("Unable to upload this picture. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(image: ExerciseMediaImage) {
    if (!writable || deleting) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      const result = await deleteExerciseImage({
        accessToken: session.accessToken,
        householdId,
        exerciseId,
        attachmentId: image.id,
      });
      if (result.kind === "unauthorized") {
        session.onSessionExpired();
        return;
      }
      if (result.kind !== "success") throw new Error("Delete failed");
      invalidateExerciseImageUrl({
        ...session,
        householdId,
        exerciseId,
        attachmentId: image.id,
      });
      setHiddenIds((old) => new Set([...old, image.id]));
      setSelectedId(undefined);
    } catch {
      setDeleteError("Unable to remove this picture. Try again.");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div data-exercise-media-id={exerciseId} className="min-w-0">
      {(images.length > 0 || !readOnly) && (
        <div className="my-1 flex max-w-full min-w-0 items-center gap-2">
          {images.length > 0 && (
            <DragDropProvider
              sensors={workoutOrderingSensors}
              onDragEnd={(event) => {
                const source = event.operation.source;
                if (
                  sortingDisabled ||
                  event.canceled ||
                  !isSortable(source) ||
                  source.initialIndex === source.index
                )
                  return;
                const attachmentId = String(source.id);
                const ids = images.map((image) => image.id),
                  from = ids.indexOf(attachmentId),
                  to = source.index;
                if (from < 0 || to < 0 || to >= ids.length || from === to)
                  return;
                ids.splice(from, 1);
                ids.splice(to, 0, attachmentId);
                void reorder(attachmentId, ids);
              }}
            >
              <ul
                aria-label={`Pictures for ${name}`}
                className="flex max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain"
              >
                {images.map((image, index) => (
                  <ExerciseThumbnail
                    key={image.id}
                    index={index}
                    sortGroup={`exercise-media:${householdId}:${exerciseId}`}
                    sortingDisabled={sortingDisabled}
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
            </DragDropProvider>
          )}
          {!readOnly && (
            <IconButton
              ref={button}
              aria-label={`Add picture for ${name}`}
              title="Add picture"
              variant="ghost"
              className="size-6! shrink-0"
              busy={busy}
              disabled={!writable || busy || reordering}
              onClick={() => {
                const fileInput = input.current;
                if (!fileInput) return;
                try {
                  fileInput.showPicker();
                } catch {
                  fileInput.click();
                }
              }}
            >
              <ImagePlus aria-hidden="true" className="size-4" />
            </IconButton>
          )}
        </div>
      )}
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
      <ImageViewer
        image={selected}
        images={images}
        thumbnailUrl={thumbnail.url}
        viewerUrl={viewer.url}
        error={viewer.error}
        alt={name}
        canDelete={writable && !reordering}
        deleting={deleting}
        actionError={deleteError}
        deleteDescription="This removes the picture from this exercise in every workout."
        onSelect={(image) => {
          setDeleteError(undefined);
          setSelectedId(image.id);
        }}
        onDelete={(image) => void remove(image)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined);
        }}
      />
    </div>
  );
}
