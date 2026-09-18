import * as z from "zod";

export const guestAccessLevels = ["read", "write"] as const;
export const guestAccessLevelSchema = z.enum(guestAccessLevels);
export type GuestAccessLevel = z.infer<typeof guestAccessLevelSchema>;

const guestAccessLinkNameSchema = z.string().trim().min(1).max(100);
const guestAccessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const createGuestAccessLinkRequestSchema = z
  .object({
    name: guestAccessLinkNameSchema,
    access: guestAccessLevelSchema,
  })
  .strict();

export type CreateGuestAccessLinkRequest = z.infer<
  typeof createGuestAccessLinkRequestSchema
>;

const guestAccessLinkSummarySchema = z
  .object({
    id: z.uuid(),
    householdId: z.uuid(),
    name: guestAccessLinkNameSchema,
    access: guestAccessLevelSchema,
    disabledAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type GuestAccessLinkSummary = z.infer<
  typeof guestAccessLinkSummarySchema
>;

export const createGuestAccessLinkResponseSchema = z
  .object({
    link: guestAccessLinkSummarySchema.extend({
      token: guestAccessTokenSchema,
    }),
  })
  .strict();

export type CreateGuestAccessLinkResponse = z.infer<
  typeof createGuestAccessLinkResponseSchema
>;

export const listGuestAccessLinksResponseSchema = z
  .object({ links: z.array(guestAccessLinkSummarySchema) })
  .strict();

export type ListGuestAccessLinksResponse = z.infer<
  typeof listGuestAccessLinksResponseSchema
>;

export const updateGuestAccessLinkRequestSchema = z
  .object({
    name: guestAccessLinkNameSchema.optional(),
    access: guestAccessLevelSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.access !== undefined ||
      value.enabled !== undefined,
    { message: "At least one change is required" },
  );

export type UpdateGuestAccessLinkRequest = z.infer<
  typeof updateGuestAccessLinkRequestSchema
>;

export const updateGuestAccessLinkResponseSchema = z
  .object({ link: guestAccessLinkSummarySchema })
  .strict();

export type UpdateGuestAccessLinkResponse = z.infer<
  typeof updateGuestAccessLinkResponseSchema
>;

export const regenerateGuestAccessLinkResponseSchema = z
  .object({
    link: guestAccessLinkSummarySchema.extend({
      token: guestAccessTokenSchema,
    }),
  })
  .strict();

export type RegenerateGuestAccessLinkResponse = z.infer<
  typeof regenerateGuestAccessLinkResponseSchema
>;

export const redeemGuestAccessRequestSchema = z
  .object({ token: guestAccessTokenSchema })
  .strict();

export type RedeemGuestAccessRequest = z.infer<
  typeof redeemGuestAccessRequestSchema
>;

export const guestSessionResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    access: guestAccessLevelSchema,
    cacheIdentity: z.string().min(1),
    household: z
      .object({ id: z.uuid(), name: z.string().min(1).max(100) })
      .strict(),
  })
  .strict();

export type GuestSessionResponse = z.infer<typeof guestSessionResponseSchema>;
