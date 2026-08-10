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

export type CreateHouseholdResponse = z.infer<
  typeof createHouseholdResponseSchema
>;

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

export const renameHouseholdRequestSchema = z
  .object({
    name: householdNameSchema,
  })
  .strict();

export type RenameHouseholdRequest = z.infer<
  typeof renameHouseholdRequestSchema
>;

export const transferHouseholdOwnershipRequestSchema = z
  .object({
    membershipId: z.uuid(),
  })
  .strict();

export type TransferHouseholdOwnershipRequest = z.infer<
  typeof transferHouseholdOwnershipRequestSchema
>;

const householdMemberSummarySchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1),
    role: z.enum(["owner", "member"]),
    joinedAt: z.iso.datetime(),
  })
  .strict();

export const listHouseholdMembersResponseSchema = z
  .object({
    members: z.array(householdMemberSummarySchema),
  })
  .strict();

export type ListHouseholdMembersResponse = z.infer<
  typeof listHouseholdMembersResponseSchema
>;

const pendingHouseholdInviteSummarySchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const listHouseholdInvitesResponseSchema = z
  .object({
    invites: z.array(pendingHouseholdInviteSummarySchema),
  })
  .strict();

export type ListHouseholdInvitesResponse = z.infer<
  typeof listHouseholdInvitesResponseSchema
>;
