import * as z from "zod";
import { documentFilenameSchema, documentFormats } from "./documents";

export const documentReadSchema = z
  .object({
    householdId: z.uuid(),
    documentId: z.uuid(),
    fileId: z.uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
    filename: documentFilenameSchema,

    contentType: z
      .string()
      .refine((t) => (Object.values(documentFormats) as string[]).includes(t)),

    disposition: z.enum(["inline", "attachment"]),
    expiresAt: z.number().int().positive(),
    thumbnail: z.literal(true).optional(),
  })
  .strict();

export type DocumentRead = z.infer<typeof documentReadSchema>;

export const documentUploadKey = (
  c: Pick<DocumentRead, "householdId" | "documentId" | "fileId">,
) =>
  `households/${c.householdId}/documents/${c.documentId}/files/${c.fileId}/upload`;

export const documentReadKey = (
  c: Pick<DocumentRead, "householdId" | "documentId" | "fileId" | "hash">,
) =>
  `households/${c.householdId}/documents/${c.documentId}/files/${c.fileId}/verified/${c.hash}`;

const payload = (c: DocumentRead) =>
  new TextEncoder().encode(
    JSON.stringify([
      c.thumbnail ? "home-hub-document-thumbnail-v1" : "home-hub-document-v1",
      c.householdId,
      c.documentId,
      c.fileId,
      c.hash,
      c.filename,
      c.contentType,
      c.disposition,
      c.expiresAt,
    ]),
  );

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signDocumentRead(c: DocumentRead, secret: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await key(secret), payload(c)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyDocumentRead(
  c: DocumentRead,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/u.test(signature)) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    await key(secret),
    Uint8Array.from(signature.match(/../gu) ?? [], (v) => parseInt(v, 16)),
    payload(c),
  );
}
