import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();

// Exact metadata lookup observes consumption without treating replication lag as
// invalidation of a newly issued, one-time secret.
export const householdInvitationQuery = define(
  z.object({ householdId: z.uuid(), inviteId: z.uuid() }).strict(),
  ({ args, ctx }) =>
    zql.householdInvites
      .where("id", args.inviteId)
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household
          .where("deletedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userId", ctx.userId).where("role", "owner"),
          ),
      )
      .one(),
);

export const householdInvitesQuery = define(
  z
    .object({ householdId: z.uuid(), asOf: z.number().finite().nonnegative() })
    .strict(),
  ({ args, ctx }) =>
    zql.householdInvites
      .where("householdId", args.householdId)
      .where("acceptedAt", "IS", null)
      .where("revokedAt", "IS", null)
      .where("expiresAt", ">", args.asOf)
      .whereExists("household", (household) =>
        household
          .where("deletedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userId", ctx.userId).where("role", "owner"),
          ),
      )
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .limit(500),
);
