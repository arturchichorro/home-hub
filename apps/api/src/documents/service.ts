import { createHash, randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  documentFiles,
  documents,
  households,
} from "@home-hub/database/schema";
import {
  type DocumentRead,
  documentReadKey,
  documentUploadKey,
} from "@home-hub/shared/document-delivery";
import {
  documentInitialTitle,
  type documentUploadSchema,
} from "@home-hub/shared/documents";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { infer as Infer } from "zod";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";
import {
  InvalidDocumentFileError,
  validateDocumentFile,
} from "./validate-file";
export class DocumentServiceError extends Error {
  constructor(
    readonly status: 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}
type Scope = { userId: string; householdId: string };
export type DocumentStorage = {
  signUpload: (key: string, byteSize: number) => Promise<string>;
  readUpload: (key: string, expectedBytes: number) => Promise<Uint8Array>;
  putVerified: (
    key: string,
    data: Uint8Array,
    contentType: string,
  ) => Promise<void>;
  signRead: (cap: DocumentRead) => Promise<string>;
};
export async function authorizeDocuments(
  tx: DatabaseTransaction,
  input: Scope,
) {
  if (!(await findActiveUser(tx, input.userId)))
    throw new DocumentServiceError(401, "Unauthorized");
  const [h] = await tx
    .select({ id: households.id })
    .from(households)
    .where(
      and(eq(households.id, input.householdId), isNull(households.deletedAt)),
    )
    .for("share");
  if (
    !h ||
    !(await findHouseholdMembershipForShare(tx, input)) ||
    !(await findEnabledHouseholdModuleForShare(tx, {
      householdId: input.householdId,
      moduleKey: "documents",
    }))
  )
    throw new DocumentServiceError(403, "Forbidden");
}
async function parent(
  tx: DatabaseTransaction,
  input: Scope,
  documentId: string,
) {
  const [d] = await tx
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.householdId, input.householdId),
        isNull(documents.deletedAt),
      ),
    )
    .for("update");
  if (!d) throw new DocumentServiceError(404, "Document not found");
  return d;
}
export function createDocumentServices({
  db,
  storage,
}: {
  db: Database;
  storage: DocumentStorage;
}) {
  let processing = 0;
  return {
    async createUpload(input: Scope & Infer<typeof documentUploadSchema>) {
      const fileId = randomUUID(),
        documentId = input.documentId ?? randomUUID();
      await db.transaction(async (tx) => {
        await authorizeDocuments(tx, input);
        const d = input.documentId
          ? await parent(tx, input, documentId)
          : undefined;
        await tx.insert(documentFiles).values({
          id: fileId,
          householdId: input.householdId,
          documentId,
          filename: input.filename,
          contentType: "application/octet-stream",
          byteSize: input.byteSize,
          objectKey: documentUploadKey({ ...input, documentId, fileId }),
          expectedFileId: d?.fileId ?? null,
        });
      });
      return {
        fileId,
        documentId,
        url: await storage.signUpload(
          documentUploadKey({ ...input, documentId, fileId }),
          input.byteSize,
        ),
      };
    },
    async confirm(input: Scope & { fileId: string }) {
      const initial = await db.transaction(async (tx) => {
        await authorizeDocuments(tx, input);
        const [f] = await tx
          .select()
          .from(documentFiles)
          .where(
            and(
              eq(documentFiles.id, input.fileId),
              eq(documentFiles.householdId, input.householdId),
            ),
          );
        if (!f) throw new DocumentServiceError(404, "Upload not found");
        // A removed parent cannot be resurrected by retrying an old confirmation.
        if (f.expectedFileId || f.confirmedAt)
          await parent(tx, input, f.documentId);
        return f;
      });
      if (initial.confirmedAt) return { documentId: initial.documentId };
      if (processing >= 2)
        throw new DocumentServiceError(
          503,
          "Processing is busy. Please retry.",
        );
      processing++;
      try {
        const bytes = await storage.readUpload(
          documentUploadKey({
            householdId: input.householdId,
            documentId: initial.documentId,
            fileId: initial.id,
          }),
          initial.byteSize,
        );
        if (bytes.length !== initial.byteSize)
          throw new InvalidDocumentFileError();
        const contentType = validateDocumentFile(initial.filename, bytes);
        const hash = createHash("sha256").update(bytes).digest("hex");
        const objectKey = documentReadKey({
          householdId: input.householdId,
          documentId: initial.documentId,
          fileId: initial.id,
          hash,
        });
        await storage.putVerified(objectKey, bytes, contentType);
        return await db.transaction(async (tx) => {
          await authorizeDocuments(tx, input);
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.householdId + initial.documentId},0))`,
          );
          const [f] = await tx
            .select()
            .from(documentFiles)
            .where(
              and(
                eq(documentFiles.id, initial.id),
                eq(documentFiles.householdId, input.householdId),
              ),
            )
            .for("update");
          if (!f) throw new DocumentServiceError(404, "Upload not found");
          if (f.confirmedAt) {
            await parent(tx, input, f.documentId);
            return { documentId: f.documentId };
          }
          const now = new Date();
          if (f.expectedFileId) {
            const d = await parent(tx, input, f.documentId);
            if (d.fileId !== f.expectedFileId)
              throw new DocumentServiceError(
                409,
                "The file changed elsewhere. Discard this upload and choose the file again.",
              );
            await tx
              .update(documents)
              .set({ fileId: f.id, uploadedAt: now, updatedAt: now })
              .where(eq(documents.id, d.id));
          } else {
            const [d] = await tx
              .select({ id: documents.id })
              .from(documents)
              .where(eq(documents.id, f.documentId));
            if (d)
              throw new DocumentServiceError(409, "Document already exists");
            await tx.insert(documents).values({
              id: f.documentId,
              householdId: input.householdId,
              title: documentInitialTitle(f.filename),
              fileId: f.id,
              uploadedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }
          await tx
            .update(documentFiles)
            .set({ objectKey, contentType, confirmedAt: now })
            .where(eq(documentFiles.id, f.id));
          return { documentId: f.documentId };
        });
      } catch (error) {
        if (error instanceof InvalidDocumentFileError)
          throw new DocumentServiceError(
            422,
            "Unsupported or invalid document file.",
          );
        throw error;
      } finally {
        processing--;
      }
    },
    async read(
      input: Scope & {
        documentId: string;
        disposition: "inline" | "attachment";
      },
    ) {
      const f = await db.transaction(async (tx) => {
        await authorizeDocuments(tx, input);
        const d = await parent(tx, input, input.documentId);
        const [f] = await tx
          .select()
          .from(documentFiles)
          .where(
            and(
              eq(documentFiles.id, d.fileId),
              eq(documentFiles.householdId, input.householdId),
              eq(documentFiles.documentId, d.id),
            ),
          );
        if (!f?.confirmedAt)
          throw new DocumentServiceError(404, "File not found");
        return f;
      });
      const hash = f.objectKey.split("/").pop() ?? "";
      return {
        url: await storage.signRead({
          householdId: input.householdId,
          documentId: input.documentId,
          fileId: f.id,
          filename: f.filename,
          contentType: f.contentType,
          hash,
          disposition: input.disposition,
          expiresAt: Math.floor(Date.now() / 1000) + 900,
        }),
        contentType: f.contentType,
        filename: f.filename,
        fileId: f.id,
      };
    },
  };
}
export type DocumentServices = ReturnType<typeof createDocumentServices>;
