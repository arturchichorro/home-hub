import * as z from "zod";
export const documentUploadResponseSchema = z.object({
  documentId: z.uuid(),
  fileId: z.uuid(),
  url: z.url(),
});
export const documentConfirmResponseSchema = z.object({ documentId: z.uuid() });
export const documentReadResponseSchema = z.object({
  url: z.url(),
  contentType: z.string(),
  filename: z.string(),
  fileId: z.uuid(),
});
export type DocumentColor = z.infer<typeof documentColorSchema>;
export const documentMaxBytes = 50 * 1024 * 1024;
export const documentFormats = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
} as const;
export const documentColors = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
] as const;
export const documentColorSchema = z.enum(documentColors);
export function documentContentType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? documentFormats[ext as keyof typeof documentFormats] : undefined;
}
export const documentFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (s) =>
      Array.from(s).every(
        (c) =>
          c.charCodeAt(0) >= 32 &&
          c.charCodeAt(0) !== 127 &&
          c !== "/" &&
          c.charCodeAt(0) !== 92,
      ),
    "Invalid filename",
  )
  .refine((s) => !!documentContentType(s), "Unsupported file type");
export const documentUploadSchema = z
  .object({
    filename: documentFilenameSchema,
    byteSize: z.number().int().min(1).max(documentMaxBytes),
    documentId: z.uuid().optional(),
  })
  .strict();
export const documentScopeSchema = z
  .object({ householdId: z.uuid(), documentId: z.uuid() })
  .strict();
export const documentPageSchema = z
  .object({
    householdId: z.uuid(),
    search: z.string().max(200).default(""),
    tagIds: z.array(z.uuid()).max(100).default([]),
    untagged: z.boolean().default(false),
    sort: z.enum(["title", "uploadedAt"]).default("uploadedAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(1000).default(51),
  })
  .strict();
export const documentTextMutationSchema = documentScopeSchema
  .extend({
    field: z.enum(["title", "description"]),
    value: z.string().max(1000),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .superRefine((v, ctx) => {
    if (v.field === "title" && (!v.value.trim() || v.value.trim().length > 200))
      ctx.addIssue({
        code: "custom",
        message: "A title of 1–200 characters is required",
        path: ["value"],
      });
  });
export const documentTagSchema = z
  .object({
    householdId: z.uuid(),
    tagId: z.uuid(),
    name: z.string().trim().min(1).max(50),
    color: documentColorSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const documentTagAssignmentSchema = documentScopeSchema
  .extend({ tagId: z.uuid(), assigned: z.boolean() })
  .strict();
export const documentDeleteTagSchema = z
  .object({
    householdId: z.uuid(),
    tagId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const normalizeDocumentTag = (name: string) =>
  name.trim().replace(/\s+/gu, " ").toLowerCase();
export function documentInitialTitle(filename: string) {
  return (filename.replace(/\.[^.]+$/u, "").trim() || filename).slice(0, 200);
}
