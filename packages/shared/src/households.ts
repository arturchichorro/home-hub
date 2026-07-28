import * as z from "zod";

export const createHouseholdRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
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
