import {
  documentConfirmResponseSchema,
  documentReadResponseSchema,
  documentUploadResponseSchema,
  documentUploadSchema,
} from "@home-hub/shared/documents";
import type { MediaSession } from "../media/session";
export type UploadSession = { documentId: string; fileId: string; url: string };
export async function documentRequest<T>(
  session: MediaSession,
  householdId: string,
  path: string,
  body: unknown,
  schema: { parse: (data: unknown) => T },
): Promise<T> {
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/documents${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    },
  );
  if (response.status === 401) {
    session.onSessionExpired();
    throw Error("Session expired");
  }
  if (!response.ok) {
    // Never display arbitrary upstream messages or SQL errors.
    const messages: Record<number, string> = {
      403: "You no longer have access to Documents.",
      404: "This document is no longer available.",
      409: "This file changed elsewhere. Discard this upload and choose it again.",
      422: "Unsupported or invalid file. Choose a supported document up to 50 MiB.",
      503: "Unable to complete this action. Please retry.",
    };
    throw Error(
      messages[response.status] ??
        "The document action could not be completed.",
    );
  }
  return schema.parse(await response.json());
}
export const beginDocumentUpload = (
  session: MediaSession,
  householdId: string,
  file: File,
  documentId?: string,
) =>
  documentRequest(
    session,
    householdId,
    "/uploads",
    documentUploadSchema.parse({
      filename: file.name,
      byteSize: file.size,
      ...(documentId ? { documentId } : {}),
    }),
    documentUploadResponseSchema,
  );
export const confirmDocumentUpload = (
  session: MediaSession,
  householdId: string,
  fileId: string,
) =>
  documentRequest(
    session,
    householdId,
    `/uploads/${fileId}/confirm`,
    {},
    documentConfirmResponseSchema,
  );
export const readDocument = (
  session: MediaSession,
  householdId: string,
  documentId: string,
  disposition: "inline" | "attachment",
  thumbnail?: true,
) =>
  documentRequest(
    session,
    householdId,
    `/${documentId}/read-url`,
    { disposition, ...(thumbnail ? { thumbnail } : {}) },
    documentReadResponseSchema,
  );
export function uploadDocumentBytes(
  file: File,
  url: string,
  progress: (n: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.timeout = 300000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(Error("File upload failed. Please retry."));
    xhr.onerror = xhr.ontimeout = () =>
      reject(Error("File upload failed. Please retry."));
    xhr.send(file);
  });
}
