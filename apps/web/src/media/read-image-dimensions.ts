export type ImageDimensions = {
  width: number;
  height: number;
};

export async function readImageDimensions(
  file: File,
): Promise<ImageDimensions> {
  const image = await createImageBitmap(file);

  try {
    return { width: image.width, height: image.height };
  } finally {
    image.close();
  }
}
