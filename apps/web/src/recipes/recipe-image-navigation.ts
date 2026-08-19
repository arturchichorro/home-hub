type ImageReference = { id: string };

export function getAdjacentRecipeImage<T extends ImageReference>(
  images: readonly T[],
  currentImageId: string,
  direction: -1 | 1,
): T | undefined {
  if (images.length === 0) return undefined;

  const currentIndex = images.findIndex((image) => image.id === currentImageId);
  const startIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (startIndex + direction + images.length) % images.length;

  return images[nextIndex];
}
