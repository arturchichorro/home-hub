import { maxStillImageByteSize } from "@home-hub/shared/media";

import { InvalidStillImageError } from "@home-hub/shared/still-image-validation";

export {
  InvalidStillImageError,
  validateStillImage,
} from "@home-hub/shared/still-image-validation";

export async function readImageBytes(
  body: ReadableStream,
  expectedSize: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (expectedSize <= 0 || expectedSize > maxStillImageByteSize)
    throw new InvalidStillImageError();
  const reader = body.getReader();
  const bytes = new Uint8Array(expectedSize);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (
        !(value instanceof Uint8Array) ||
        offset + value.byteLength > expectedSize
      ) {
        await reader.cancel();
        throw new InvalidStillImageError();
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expectedSize) throw new InvalidStillImageError();
  return bytes;
}
