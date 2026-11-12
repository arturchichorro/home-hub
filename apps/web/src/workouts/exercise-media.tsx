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
import type {
  Media,
  ExerciseMedia as MediaLink,
} from "@home-hub/shared/zero/schema";
import {
  Dumbbell,
  ErrorPopover,
  IconButton,
  ImagePlus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import {
  type ChangeEvent,
  createContext,
  memo,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ImageViewer } from "../media/image-viewer";
import { readImageDimensions } from "../media/read-image-dimensions";
import { type MediaSession, useMediaSession } from "../media/session";
import { blockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
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

type MediaRow = MediaLink & { asset?: Media | undefined };

const CatalogMediaContext = createContext<
  | {
      householdId: string;
      complete: boolean;
      rows: ReadonlyMap<string, readonly MediaRow[]>;
    }
  | undefined
>(undefined);

const emptyMediaRows: readonly MediaRow[] = [];

// Same authorized rows as the individual galleries, one subscription per catalog.
export function CatalogMediaProvider({
  householdId,
  children,
}: {
  householdId: string;
  children: ReactNode;
}) {
  const [rows, result] = useQuery(
    queries.workouts.catalogMedia({ householdId }),
  );
  const value = useMemo(() => {
    const grouped = new Map<string, MediaRow[]>();

    for (const row of rows) {
      const group = grouped.get(row.exerciseId) ?? [];
      group.push(row);
      grouped.set(row.exerciseId, group);
    }

    return { householdId, rows: grouped, complete: result.type === "complete" };
  }, [householdId, rows, result.type]);

  return <CatalogMediaContext value={value}>{children}</CatalogMediaContext>;
}

type Props = {
  householdId: string;
  exerciseId: string;
  name: string;
  readOnly?: boolean;
  disabled?: boolean;
  leading?: boolean;
  onBusyChange?: ((busy: boolean) => void) | undefined;
};

export const ExerciseMedia = memo(function ExerciseMedia(props: Props) {
  const session = useMediaSession();

  return session ? (
    <ExerciseMediaGallery {...props} session={session} />
  ) : props.leading ? (
    <ExerciseMediaPlaceholder />
  ) : null;
});

function ExerciseMediaPlaceholder() {
  return (
    <div className="w-12 sm:w-26">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-lg bg-raised/50 text-subtle"
      >
        <Dumbbell className="size-5" />
      </div>
    </div>
  );
}

function ExerciseThumbnail({
  image,
  session,
  name,
  onOpen,
  index,
  sortGroup,
  sortingDisabled,
  dragEnabled,
}: {
  index: number;
  sortGroup: string;
  sortingDisabled: boolean;
  dragEnabled: boolean;
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
  const dragged = useRef(false);
  useEffect(() => {
    if (sortable.isDragging) {
      dragged.current = true;
    }
  }, [sortable.isDragging]);
  const state = useExerciseImageUrl({
    ...session,
    householdId: image.householdId,
    exerciseId: image.exerciseId,
    attachmentId: image.id,
    variant: "thumbnail",
  });

  return (
    <li
      ref={dragEnabled ? sortable.ref : undefined}
      data-exercise-media-attachment-id={image.id}
      className={`size-12 shrink-0 overflow-hidden rounded-lg bg-raised ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <button
        ref={dragEnabled ? sortable.handleRef : undefined}
        type="button"
        draggable={false}
        aria-label={`Open picture for ${name}`}
        title={
          sortingDisabled
            ? undefined
            : "Drag to reorder, or press Space and arrow keys"
        }
        className={`size-full touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-focus-ring ${sortingDisabled ? "cursor-zoom-in" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={() => {
          if (!sortable.isDragging) {
            dragged.current = false;
          }
        }}
        onKeyDown={() => {
          if (!sortable.isDragging) {
            dragged.current = false;
          }
        }}
        onClick={() => {
          // A keyboard/pointer drop can also generate a native button click.
          // Consume it rather than opening the viewer immediately after sorting.
          if (sortable.isDragging) {
            dragged.current = true;
            return;
          }
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onOpen();
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
  leading = false,
  onBusyChange,
}: Props & { session: MediaSession }) {
  const enabled = useZeroMutationEnabled();
  const zero = useZero();
  const context = useContext(CatalogMediaContext);
  const provided = context?.householdId === householdId ? context : undefined;
  const [individualRows, individualResult] = useQuery(
    provided
      ? undefined
      : queries.workouts.exerciseMedia({ householdId, exerciseId }),
  );
  const rows = provided
    ? (provided.rows.get(exerciseId) ?? emptyMediaRows)
    : (individualRows ?? emptyMediaRows);
  const complete = provided
    ? provided.complete
    : individualResult.type === "complete";
  const [selectedId, setSelectedId] = useState<string>();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const notify = useRef(onBusyChange);
  notify.current = onBusyChange;
  useEffect(() => {
    notify.current?.(busy || deleting || reordering);
  }, [busy, deleting, reordering]);
  useEffect(() => () => notify.current?.(false), []);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const images = exerciseImagesFromRows(rows).filter(
    (image) => !hiddenIds.has(image.id),
  );
  const selected = images.find((image) => image.id === selectedId);
  const writable = enabled && !disabled && !readOnly && complete;
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
    if (!selectedId || !viewer.url || images.length < 2) {
      return;
    }

    const index = images.findIndex((image) => image.id === selectedId);

    for (const direction of [-1, 1]) {
      const next = images[(index + direction + images.length) % images.length];

      if (next) {
        void prefetchExerciseImage({
          ...session,
          householdId,
          exerciseId,
          attachmentId: next.id,
          variant: "viewer",
        }).catch(() => undefined);
      }
    }
  }, [selectedId, viewer.url, images, session, householdId, exerciseId]);

  async function reorder(attachmentId: string, orderedAttachmentIds: string[]) {
    if (sortingDisabled) {
      return;
    }

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
      const outcome = await acknowledgeMutation(mutation);

      if (outcome.type === "error") {
        throw new Error("Reorder failed");
      }
    } catch {
      setError("Unable to reorder these pictures. Try again.");
    } finally {
      setReordering(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || busy || !writable) {
      return;
    }

    const allowUpdate = blockAppUpdate();
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

      const confirmed = await confirmExerciseImage({
        accessToken: session.accessToken,
        householdId,
        exerciseId,
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
    }
  }

  async function remove(image: ExerciseMediaImage) {
    if (!writable || deleting) {
      return;
    }

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

      if (result.kind !== "success") {
        throw new Error("Delete failed");
      }

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
    <div
      data-exercise-media-id={exerciseId}
      className={leading ? "w-12 min-w-0 sm:w-26" : "min-w-0"}
    >
      {leading && images.length === 0 && <ExerciseMediaPlaceholder />}
      {(images.length > 0 || !readOnly) && (
        <div
          className={
            leading
              ? "flex max-w-full min-w-0 flex-wrap items-center gap-2"
              : "my-1 flex max-w-full min-w-0 items-center gap-2"
          }
        >
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
                ) {
                  return;
                }

                const attachmentId = String(source.id);
                const ids = images.map((image) => image.id);
                const from = ids.indexOf(attachmentId);
                const to = source.index;

                if (from < 0 || to < 0 || to >= ids.length || from === to) {
                  return;
                }

                ids.splice(from, 1);
                ids.splice(to, 0, attachmentId);
                void reorder(attachmentId, ids);
              }}
            >
              <ul
                aria-label={`Pictures for ${name}`}
                className={
                  leading
                    ? "flex max-w-full min-w-0 flex-wrap gap-2"
                    : "flex max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain"
                }
              >
                {images.map((image, index) => (
                  <ExerciseThumbnail
                    key={image.id}
                    index={index}
                    sortGroup={`exercise-media:${householdId}:${exerciseId}`}
                    sortingDisabled={sortingDisabled}
                    dragEnabled={writable}
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

                if (!fileInput) {
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
            </IconButton>
          )}
        </div>
      )}
      {!readOnly && (
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          tabIndex={-1}
          onChange={(event) => void upload(event)}
        />
      )}
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
          if (!open) {
            setSelectedId(undefined);
          }
        }}
      />
    </div>
  );
}
