import * as z from "zod";

const householdNameSchema = z.string().trim().min(1).max(100);

export const createHouseholdRequestSchema = z
  .object({
    name: householdNameSchema,
  })
  .strict();

export const createHouseholdResponseSchema = z
  .object({
    household: z
      .object({
        id: z.uuid(),
        name: householdNameSchema,
      })
      .strict(),
  })
  .strict();

export const reorderHouseholdsMutationSchema = z
  .object({
    householdId: z.uuid(),

    orderedHouseholdIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Ordered household IDs must be unique",
      }),

    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const acceptHouseholdInviteRequestSchema = z
  .object({
    token: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export type AcceptHouseholdInviteRequest = z.infer<
  typeof acceptHouseholdInviteRequestSchema
>;

export const acceptHouseholdInviteResponseSchema = z
  .object({
    membership: z
      .object({
        id: z.uuid(),
        householdId: z.uuid(),
        role: z.literal("member"),
      })
      .strict(),
  })
  .strict();

export type AcceptHouseholdInviteResponse = z.infer<
  typeof acceptHouseholdInviteResponseSchema
>;

export const createHouseholdInviteResponseSchema = z
  .object({
    invite: z
      .object({
        id: z.uuid(),
        householdId: z.uuid(),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      })
      .strict(),
  })
  .strict();

export type CreateHouseholdInviteResponse = z.infer<
  typeof createHouseholdInviteResponseSchema
>;

export const renameHouseholdRequestSchema = z
  .object({
    name: householdNameSchema,
  })
  .strict();

export const transferHouseholdOwnershipRequestSchema = z
  .object({
    membershipId: z.uuid(),
  })
  .strict();
