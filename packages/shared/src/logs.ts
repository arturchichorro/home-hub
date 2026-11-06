import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";

export const logColors = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
] as const;

const logColorSchema = z.enum(logColors);

export const cleanLogTitle = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/gu, " ");

export const normalizedLogTitle = (s: string) => cleanLogTitle(s).toLowerCase();

export const logTitleSchema = z
  .string()
  .transform(cleanLogTitle)
  .pipe(z.string().min(1).max(100));

export const cleanLogNote = (s: string) => {
  const normalized = s.replace(/\r\n?/gu, "\n");

  return normalized.trim() ? normalized : "";
};

export const logScopeSchema = z
  .object({ householdId: z.uuid(), logId: z.uuid() })
  .strict();

export const logCreateSchema = logScopeSchema.extend({
  title: logTitleSchema,
  optimisticTimestamp: z.number().int().nonnegative(),
});

export const logRenameSchema = logCreateSchema;

export const logCategorySchema = z
  .object({
    householdId: z.uuid(),
    categoryId: z.uuid(),
    name: logTitleSchema,
    color: logColorSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export const logSetCategorySchema = logScopeSchema.extend({
  categoryId: z.uuid().nullable(),
  optimisticTimestamp: z.number().int().nonnegative(),
});

export const logDeleteCategorySchema = z
  .object({
    householdId: z.uuid(),
    categoryId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export const logIndexSchema = z
  .object({
    householdId: z.uuid(),
    search: z.string().max(200).default(""),
    limit: z.number().int().min(1).max(501).default(51),
  })
  .strict();

export const logEntryScopeSchema = logScopeSchema.extend({
  entryOn: calendarDateSchema,
});

export const logEntryWriteSchema = logEntryScopeSchema
  .extend({
    entryId: z.uuid(),
    writeId: z.uuid(),
    expectedVersion: z.number().int().positive().nullable(),

    note: z
      .string()
      .max(20000)
      .refine((s) => !s.includes("\u0000"), "Invalid text"),

    timeZone: timeZoneSchema,
  })
  .strict();

const logEntrySnapshotSchema = z.object({
  id: z.uuid(),
  entryOn: calendarDateSchema,
  note: z.string(),
  version: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.uuid(),
  lastEditedBy: z.uuid(),
});

export const logEntryResponseSchema = z.object({
  entry: logEntrySnapshotSchema.nullable(),
});

export type LogEntrySnapshot = z.infer<typeof logEntrySnapshotSchema>;

export type LogEntryWrite = z.infer<typeof logEntryWriteSchema>;

export const logHistorySchema = logScopeSchema
  .extend({
    search: z.string().max(200).default(""),
    before: calendarDateSchema.optional(),
  })
  .strict();
