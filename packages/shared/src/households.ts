import * as z from "zod";

const householdNameSchema = z.string().trim().min(1).max(100);

export const createHouseholdRequestSchema = z
  .object({
    name: householdNameSchema,
  })
  .strict();

export type CreateHouseholdRequest = z.infer<
  typeof createHouseholdRequestSchema
>;

export const acceptHouseholdInviteRequestSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export type AcceptHouseholdInviteRequest = z.infer<
  typeof acceptHouseholdInviteRequestSchema
>;

export const renameHouseholdRequestSchema = z
  .object({
    name: householdNameSchema,
  })
  .strict();

export type RenameHouseholdRequest = z.infer<
  typeof renameHouseholdRequestSchema
>;
