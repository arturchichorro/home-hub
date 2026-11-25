import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();

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
