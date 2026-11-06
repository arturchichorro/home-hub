import {
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { RecipeImage } from "@home-hub/shared/recipe-images";
import { type Ref, useEffect, useState } from "react";
import { ImageViewer } from "../media/image-viewer";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { prefetchRecipeImage } from "./prefetch-recipe-image";
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
  userId: string;
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
  userId,
}: RecipeImageThumbnailProps) {
  const { url, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image.id,
    onSessionExpired,
    userId,
    variant: "thumbnail",
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
  onReorder: (imageId: string, orderedImageIds: string[]) => void;
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
  userId,
}: RecipeImageGalleryProps) {
  const mutationEnabled = useZeroMutationEnabled();

  return (
    <div className="min-w-0">
      <DragDropProvider
        sensors={recipeImageSensors}
        onDragEnd={(event) => {
          if (event.canceled) {
            return;
          }

          const { source } = event.operation;

          if (!isSortable(source) || source.initialIndex === source.index) {
            return;
          }

          const reordered = [...images];
          const [moved] = reordered.splice(source.initialIndex, 1);

          if (!moved) {
            return;
          }

          reordered.splice(source.index, 0, moved);
          onReorder(
            moved.id,
            reordered.map((image) => image.id),
          );
        }}
      >
        <ul className="-mr-4 grid auto-cols-[40%] sm:auto-cols-[25%] lg:auto-cols-[20%] grid-flow-col gap-3 overflow-x-auto pr-4 sm:-mr-6 sm:pr-6 lg:-mr-8 lg:pr-8">
          {images.map((image, index) => (
            <SortableRecipeImageThumbnail
              key={image.id}
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipeId}
              image={image}
              index={index}
              disabled={!mutationEnabled}
              onSessionExpired={onSessionExpired}
              onOpen={onOpen}
              userId={userId}
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
  userId,
}: RecipeImageViewerProps) {
  const mutationEnabled = useZeroMutationEnabled();
  const { url: smallUrl } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image?.id,
    onSessionExpired,
    userId,
    variant: "thumbnail",
  });
  const { url: viewerUrl, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image?.id,
    onSessionExpired,
    userId,
    variant: "viewer",
  });
  const [loadedViewerUrl, setLoadedViewerUrl] = useState<string>();
  const viewerLoaded = viewerUrl !== undefined && loadedViewerUrl === viewerUrl;

  useEffect(() => {
    if (!image || !viewerLoaded) {
      return;
    }

    const adjacentImages = [
      getAdjacentRecipeImage(images, image.id, -1),
      getAdjacentRecipeImage(images, image.id, 1),
    ];

    for (const adjacentImage of adjacentImages) {
      if (!adjacentImage) {
        continue;
      }

      void prefetchRecipeImage({
        accessToken,
        userId,
        householdId,
        imageId: adjacentImage.id,
        recipeId,
        variant: "viewer",
      }).then((prefetch) => {
        if (prefetch.kind === "unauthorized") {
          onSessionExpired();
        }
      });
    }
  }, [
    accessToken,
    householdId,
    image,
    images,
    onSessionExpired,
    recipeId,
    userId,
    viewerLoaded,
  ]);

  return (
    <ImageViewer
      image={image}
      images={images}
      thumbnailUrl={smallUrl}
      viewerUrl={viewerUrl}
      error={error}
      alt="Recipe"
      canDelete={mutationEnabled}
      deleting={false}
      deleteDescription="Remove this picture from the recipe."
      actionError={undefined}
      onSelect={onSelect}
      onDelete={onDelete}
      onOpenChange={onOpenChange}
      onViewerLoad={setLoadedViewerUrl}
    />
  );
}
