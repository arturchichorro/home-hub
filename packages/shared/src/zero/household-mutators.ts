import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import * as z from "zod";
import {
  createHouseholdRequestSchema,
  createHouseholdResponseSchema,
  renameHouseholdRequestSchema,
} from "../households";
import { householdModuleKeySchema } from "../modules";
import type { ZeroAuthContext } from "./context";
import type { Schema } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const scope = z.object({ householdId: z.uuid() }).strict();

export const householdCommandSuccessSchema = z.object({
  kind: z.literal("success"),
});
export const householdCreateSuccessSchema =
  createHouseholdResponseSchema.extend({ kind: z.literal("success") });
export const householdCommandFailureSchema = z.object({
  kind: z.enum([
    "unauthorized",
    "forbidden",
    "invalid_member",
    "invalid_invite",
    "owner_must_transfer",
    "module_not_configured",
  ]),
});

export const householdCommandSchemas = {
  create: createHouseholdRequestSchema,
  rename: scope.extend({ name: renameHouseholdRequestSchema.shape.name }),
  delete: scope,
  leave: scope,
  removeMember: scope.extend({ membershipId: z.uuid() }),
  transferOwnership: scope.extend({ membershipId: z.uuid() }),
  setModule: scope.extend({
    moduleKey: householdModuleKeySchema,
    enabled: z.boolean(),
  }),
  revokeInvite: scope.extend({ inviteId: z.uuid() }),
};

// Permission-changing commands wait for server acknowledgement. Queue them in
// Zero, but never optimistically revoke access or grant an owner role locally.
async function authoritative({ tx }: { tx: Transaction<Schema> }) {
  if (tx.location === "server") {
    throw Error("Household command requires its server implementation");
  }
}

export const householdMutators = {
  create: define(householdCommandSchemas.create, authoritative),
  rename: define(householdCommandSchemas.rename, authoritative),
  delete: define(householdCommandSchemas.delete, authoritative),
  leave: define(householdCommandSchemas.leave, authoritative),
  removeMember: define(householdCommandSchemas.removeMember, authoritative),
  transferOwnership: define(
    householdCommandSchemas.transferOwnership,
    authoritative,
  ),
  setModule: define(householdCommandSchemas.setModule, authoritative),
  revokeInvite: define(householdCommandSchemas.revokeInvite, authoritative),
};
