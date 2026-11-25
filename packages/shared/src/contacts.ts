import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes("\u0000"), "Invalid text");

const contactNameSchema = text(150)
  .transform((s) => s.trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1, "Add a contact name"));

export const detailTypes = [
  "text",
  "phone",
  "email",
  "link",
  "birthday",
] as const;

export const detailLabels = {
  text: "Details",
  phone: "Phone",
  email: "Email",
  link: "Link",
  birthday: "Birthday",
} as const;

export function validBirthday(value: string): boolean {
  const full = value.startsWith("--") ? "2000-" + value.slice(2) : value;
  return (
    /^(?:[0-9]{4}|--)-?[0-9]{2}-[0-9]{2}$/.test(value) &&
    full >= "0001-01-01" &&
    calendarDateSchema.safeParse(full).success
  );
}

export const contactDetailSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(detailTypes),
    label: text(100).trim().min(1, "Add a label"),
    value: text(5000).refine((v) => v.trim().length > 0, "Add a value"),
  })
  .strict()
  .superRefine((row, ctx) => {
    const value = row.value.trim();
    if (row.type === "email" && !z.email().safeParse(value).success) {
      ctx.addIssue({
        code: "custom",
        message: "Enter an email address",
        path: ["value"],
      });
    }
    if (row.type === "link") {
      try {
        if (!["http:", "https:"].includes(new URL(value).protocol)) {
          throw Error();
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter an http:// or https:// link",
          path: ["value"],
        });
      }
    }
    if (row.type === "birthday" && !validBirthday(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid birthday",
        path: ["value"],
      });
    }
  });

export const contactDetailsSchema = z
  .array(contactDetailSchema)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
    "Duplicate detail identity",
  );

export const contactFieldsSchema = z
  .object({
    name: contactNameSchema,
    details: contactDetailsSchema,
    archived: z.boolean(),
  })
  .strict();

export const entryFieldsSchema = z
  .object({
    entryOn: calendarDateSchema.refine((s) => s >= "0001-01-01"),
    note: text(20000),
    contactIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .transform((ids) => [...ids].sort()),
  })
  .strict();

export const contactScopeSchema = z
  .object({ householdId: z.uuid(), contactId: z.uuid() })
  .strict();

export const entryScopeSchema = z
  .object({ householdId: z.uuid(), entryId: z.uuid() })
  .strict();

const revision = {
  expectedVersion: z.number().int().positive().nullable(),
  writeId: z.uuid(),
};

export const contactWriteSchema = contactScopeSchema.extend({
  ...revision,
  fields: contactFieldsSchema,
});

export const entryWriteSchema = entryScopeSchema.extend({
  ...revision,
  fields: entryFieldsSchema,
  timeZone: timeZoneSchema,
  action: z.enum(["save", "delete", "prepare-photo"]).default("save"),
});

export const contactIndexSchema = z
  .object({
    householdId: z.uuid(),
    search: z.string().max(200).default(""),
    archived: z.boolean().default(false),
    limit: z.number().int().min(1).max(501).default(51),
  })
  .strict();

export const entryHistorySchema = contactScopeSchema.extend({
  search: z.string().max(200).default(""),
  through: calendarDateSchema.optional(),
  before: z
    .object({
      entryOn: calendarDateSchema,
      createdAt: z.number(),
      id: z.uuid(),
    })
    .optional(),
});

export const contactResponseSchema = z.object({
  record: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      fields: contactFieldsSchema,
    })
    .nullable(),
});

export const contactEntryResponseSchema = z.object({
  record: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      fields: entryFieldsSchema,
    })
    .nullable(),
});

export type ContactDetail = z.infer<typeof contactDetailSchema>;

export type ContactFields = z.infer<typeof contactFieldsSchema>;

export type ContactEntryFields = z.infer<typeof entryFieldsSchema>;

export type ContactWrite = z.infer<typeof contactWriteSchema>;

export type ContactEntryWrite = z.infer<typeof entryWriteSchema>;

export type ContactSnapshot = {
  id: string;
  version: number;
  fields: ContactFields;
};

export type ContactEntrySnapshot = {
  id: string;
  version: number;
  fields: ContactEntryFields;
};

export function detailHref(row: ContactDetail): string | undefined {
  if (row.type === "phone") {
    const number = row.value.replace(/[^+0-9*#,;]/g, "");

    return /[0-9*#]/.test(number) ? "tel:" + number : undefined;
  }
  if (row.type === "email" && contactDetailSchema.safeParse(row).success) {
    return "mailto:" + encodeURIComponent(row.value.trim());
  }
  if (row.type === "link" && contactDetailSchema.safeParse(row).success) {
    return row.value.trim();
  }
  return undefined;
}
