import {
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { RecipeImage } from "@home-hub/shared/zero/schema";
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
import type { KeyboardEvent, Ref } from "react";
import { getAdjacentRecipeImage } from "./recipe-image-navigation";
import { useRecipeImageUrl } from "./use-recipe-image-url";

const recipeImagePointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === "mouse") {
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    }
    if (event.pointerType === "touch") {
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 }),
      ];
    }
    return [
      new PointerActivationConstraints.Delay({ value: 200, tolerance: 10 }),
      new PointerActivationConstraints.Distance({ value: 5 }),
    ];
  },
});

function recipeImageSensors(defaults: Sensors): Sensors {
  return [
    ...defaults.filter((sensor) => sensor !== PointerSensor),
    recipeImagePointerSensor,
  ];
}

type RecipeImageContext = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

type RecipeImageThumbnailProps = RecipeImageContext & {
  image: RecipeImage;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  containerRef?: Ref<HTMLLIElement>;
  onOpen: (image: RecipeImage) => void;
};

export function RecipeImageThumbnail({
  accessToken,
  householdId,
  recipeId,
  image,
  className,
  buttonRef,
  containerRef,
  onSessionExpired,
  onOpen,
}: RecipeImageThumbnailProps) {
  const { url, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image.id,
    onSessionExpired,
  });
  const classes = [
    "aspect-square overflow-hidden rounded-lg bg-raised",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={containerRef} className={`${classes} relative`}>
      {url ? (
        <button
          ref={buttonRef}
          type="button"
          className={`size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-focus-ring ${buttonRef ? "touch-none" : ""}`}
          aria-label="Open recipe image"
          onClick={() => onOpen(image)}
        >
          <img
            src={url}
            alt=""
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            loading="lazy"
            className="size-full object-cover"
          />
        </button>
      ) : error ? (
        <p className="grid size-full place-items-center p-3 text-center text-xs text-muted">
          Image unavailable
        </p>
      ) : (
        <div className="grid size-full animate-pulse place-items-center bg-raised">
          <span className="sr-only">Loading image</span>
        </div>
      )}
    </li>
  );
}

type RecipeImageGalleryProps = RecipeImageContext & {
  images: readonly RecipeImage[];
  onOpen: (image: RecipeImage) => void;
  onReorder: (orderedImageIds: string[]) => void;
};

function SortableRecipeImageThumbnail({
  image,
  index,
  disabled,
  ...props
}: Omit<RecipeImageThumbnailProps, "buttonRef" | "containerRef"> & {
  disabled: boolean;
  index: number;
}) {
  const sortable = useSortable({
    id: image.id,
    index,
    type: "recipe-image",
    accept: "recipe-image",
    disabled,
  });

  return (
    <RecipeImageThumbnail
      {...props}
      image={image}
      buttonRef={sortable.handleRef}
      containerRef={sortable.ref}
    />
  );
}

export function RecipeImageGallery({
  accessToken,
  householdId,
  recipeId,
  images,
  onSessionExpired,
  onOpen,
  onReorder,
}: RecipeImageGalleryProps) {
  const columnSize =
    images.length > 3 ? "auto-cols-[30%]" : "auto-cols-[calc((100%-1.5rem)/3)]";

  return (
    <div className="min-w-0">
      <DragDropProvider
        sensors={recipeImageSensors}
        onDragEnd={(event) => {
          if (event.canceled) return;
          const { source } = event.operation;
          if (!isSortable(source) || source.initialIndex === source.index)
            return;
          const reordered = [...images];
          const [moved] = reordered.splice(source.initialIndex, 1);
          if (!moved) return;
          reordered.splice(source.index, 0, moved);
          onReorder(reordered.map((image) => image.id));
        }}
      >
        <ul
          className={`grid ${columnSize} grid-flow-col gap-3 overflow-x-auto`}
        >
          {images.map((image, index) => (
            <SortableRecipeImageThumbnail
              key={image.id}
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipeId}
              image={image}
              index={index}
              disabled={false}
              onSessionExpired={onSessionExpired}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </DragDropProvider>
    </div>
  );
}

type RecipeImageViewerProps = RecipeImageContext & {
  image: RecipeImage | undefined;
  images: readonly RecipeImage[];
  onDelete: (image: RecipeImage) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (image: RecipeImage) => void;
};

export function RecipeImageViewer({
  accessToken,
  householdId,
  recipeId,
  image,
  images,
  onDelete,
  onSessionExpired,
  onOpenChange,
  onSelect,
}: RecipeImageViewerProps) {
  const { url, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image?.id,
    onSessionExpired,
  });
  const canNavigate = images.length > 1;

  function navigate(direction: -1 | 1) {
    if (!image) return;
    const nextImage = getAdjacentRecipeImage(images, image.id, direction);
    if (nextImage) onSelect(nextImage);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canNavigate) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
    }
  }

  return (
    <DialogRoot open={image !== undefined} onOpenChange={onOpenChange}>
      <DialogPopup
        appearance="bare"
        title="Image preview"
        size="large"
        onKeyDown={handleKeyDown}
      >
        <DialogClose
          aria-label="Close image preview"
          className="fixed! top-4 left-4 z-10 size-10! rounded-full p-0!"
        >
          <X aria-hidden="true" />
        </DialogClose>
        {image ? (
          <ConfirmationPopover
            title="Delete picture?"
            description="This permanently removes the picture."
            trigger={
              <IconButton
                aria-label="Delete picture"
                className="fixed! top-4 right-4 z-10 rounded-full"
                variant="secondary"
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            }
            onConfirm={() => onDelete(image)}
          />
        ) : null}
        {url ? (
          <img
            src={url}
            alt="Recipe"
            width={image?.width ?? undefined}
            height={image?.height ?? undefined}
            className="max-h-[90vh] w-full object-contain"
          />
        ) : error ? (
          <InlineAlert role="alert" variant="danger">
            This image is not currently available.
          </InlineAlert>
        ) : (
          <div className="aspect-video animate-pulse rounded-md bg-surface" />
        )}
        {canNavigate ? (
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
        ) : null}
      </DialogPopup>
    </DialogRoot>
  );
}
