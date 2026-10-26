import {
  maxStillImageByteSize,
  type StillImageContentType,
} from "@home-hub/shared/media";

export class InvalidStillImageError extends Error {}

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

// Detect container-level animation before any lossy transform. The Images binding
// still performs actual decoding; header sniffing is not a substitute for that.
export function validateStillImage(
  bytes: Uint8Array,
  contentType: StillImageContentType,
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  const invalid = () => {
    throw new InvalidStillImageError();
  };
  if (contentType === "image/jpeg") {
    if (
      bytes.length < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    )
      invalid();
    return;
  }
  if (contentType === "image/png") {
    if (
      bytes.length < 33 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    )
      invalid();
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = ascii(offset + 4, 4);
      const end = offset + 12 + length;
      if (
        end > bytes.length ||
        (offset === 8 && (type !== "IHDR" || length !== 13))
      )
        invalid();
      if (["acTL", "fcTL", "fdAT"].includes(type)) invalid();
      if (type === "IEND") {
        if (length !== 0 || end !== bytes.length) invalid();
        return;
      }
      offset = end;
    }
    invalid();
  }
  if (contentType === "image/webp") {
    if (
      bytes.length < 20 ||
      ascii(0, 4) !== "RIFF" ||
      ascii(8, 4) !== "WEBP" ||
      view.getUint32(4, true) + 8 !== bytes.length
    )
      invalid();
    let offset = 12;
    let pixels = false;
    while (offset + 8 <= bytes.length) {
      const type = ascii(offset, 4);
      const length = view.getUint32(offset + 4, true);
      const end = offset + 8 + length + (length % 2);
      if (end > bytes.length) invalid();
      if (
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" &&
          (length !== 10 || (view.getUint8(offset + 8) & 2) !== 0))
      )
        invalid();
      if (type === "VP8 " || type === "VP8L") pixels = true;
      offset = end;
    }
    if (!pixels || offset !== bytes.length) invalid();
    return;
  }
  invalid();
}
