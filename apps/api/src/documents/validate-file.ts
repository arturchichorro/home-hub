import { inflateRawSync } from "node:zlib";
import {
  documentContentType,
  documentMaxBytes,
} from "@home-hub/shared/documents";
import type { StillImageContentType } from "@home-hub/shared/media";
import { validateStillImage } from "@home-hub/shared/still-image-validation";
export class InvalidDocumentFileError extends Error {}
export function validateDocumentFile(
  filename: string,
  data: Uint8Array,
): string {
  const bad = () => {
    throw new InvalidDocumentFileError("Unsupported or invalid document");
  };
  const type = documentContentType(filename);
  if (!type || !data.length || data.length > documentMaxBytes) return bad();
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (type.startsWith("image/")) {
    try {
      validateStillImage(data, type as StillImageContentType);
    } catch {
      return bad();
    }
    return type;
  }
  if (type === "application/pdf") {
    if (
      !b
        .subarray(0, 8)
        .toString("ascii")
        .match(/^%PDF-[12]\.\d/u) ||
      !b.subarray(Math.max(0, b.length - 2048)).includes(Buffer.from("%%EOF"))
    )
      return bad();
    return type;
  }
  if (type.startsWith("text/")) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return bad();
    }
    if (
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Explicitly reject binary control characters in text uploads.
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text) ||
      /^\s*(?:<!doctype\s+html|<html|<svg|<script)/iu.test(text)
    )
      return bad();
    return type;
  }
  // Inspect ZIP central-directory names, bounds and the actual OOXML content
  // types. Never extract user paths; bound decompression of the manifest.
  const ext = filename.split(".").pop()?.toLowerCase();
  const root =
    ext === "docx"
      ? "word/document.xml"
      : ext === "xlsx"
        ? "xl/workbook.xml"
        : "ppt/presentation.xml";
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (
      b.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + b.readUInt16LE(i + 20) === b.length
    ) {
      eocd = i;
      break;
    }
  if (
    eocd < 0 ||
    b.readUInt16LE(eocd + 4) ||
    b.readUInt16LE(eocd + 6) ||
    b.readUInt16LE(eocd + 8) !== b.readUInt16LE(eocd + 10)
  )
    return bad();
  const count = b.readUInt16LE(eocd + 10),
    size = b.readUInt32LE(eocd + 12),
    offset = b.readUInt32LE(eocd + 16);
  if (count === 0 || count > 10000 || offset + size !== eocd) return bad();
  let cursor = offset,
    manifest: string | undefined,
    hasRoot = false,
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || b.readUInt32LE(cursor) !== 0x02014b50)
      return bad();
    const flags = b.readUInt16LE(cursor + 8),
      method = b.readUInt16LE(cursor + 10),
      compressed = b.readUInt32LE(cursor + 20),
      expanded = b.readUInt32LE(cursor + 24),
      n = b.readUInt16LE(cursor + 28),
      extra = b.readUInt16LE(cursor + 30),
      comment = b.readUInt16LE(cursor + 32),
      local = b.readUInt32LE(cursor + 42);
    const next = cursor + 46 + n + extra + comment;
    if (
      next > eocd ||
      local + 30 > offset ||
      b.readUInt32LE(local) !== 0x04034b50 ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      return bad();
    const name = b.subarray(cursor + 46, cursor + 46 + n).toString("utf8");
    if (
      names.has(name) ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      /vbaproject|activex|embeddings\//iu.test(name)
    )
      return bad();
    names.add(name);
    total += expanded;
    if (total > 200 * 1024 * 1024) return bad();
    const begin =
      local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    if (
      begin + compressed > offset ||
      b
        .subarray(local + 30, local + 30 + b.readUInt16LE(local + 26))
        .toString("utf8") !== name ||
      b.readUInt16LE(local + 8) !== method
    )
      return bad();
    if (name === root) hasRoot = true;
    if (name === "[Content_Types].xml") {
      if (expanded > 1024 * 1024 || compressed > 1024 * 1024) return bad();
      try {
        manifest = (
          method === 8
            ? inflateRawSync(b.subarray(begin, begin + compressed), {
                maxOutputLength: 1024 * 1024,
              })
            : b.subarray(begin, begin + compressed)
        ).toString("utf8");
      } catch {
        return bad();
      }
      if (/macroenabled|vba|<!doctype|<!entity/iu.test(manifest)) return bad();
    }
    cursor = next;
  }
  if (
    cursor !== eocd ||
    !manifest ||
    !hasRoot ||
    !manifest.includes(
      type
        .replace(/\.document$/u, ".document.main+xml")
        .replace(/\.sheet$/u, ".sheet.main+xml")
        .replace(/\.presentation$/u, ".presentation.main+xml"),
    )
  )
    return bad();
  return type;
}
