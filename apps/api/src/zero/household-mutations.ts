import type { Database, DatabaseTransaction } from "@home-hub/database";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { householdCommandSchemas } from "@home-hub/shared/zero/household-mutators";
import type { Schema } from "@home-hub/shared/zero/schema";
import {
  ApplicationError,
  defineMutatorWithType,
  type Transaction,
} from "@rocicorp/zero";
import { createHouseholdService } from "../households/create";
import { createDeleteHouseholdService } from "../households/delete";
import { createLeaveHouseholdService } from "../households/leave";
import { createRemoveHouseholdMemberService } from "../households/remove-member";
import { createRenameHouseholdService } from "../households/rename";
import { createRevokeHouseholdInviteService } from "../households/revoke-invite";
import { createSetHouseholdModuleEnabledService } from "../households/set-module-enabled";
import { createTransferHouseholdOwnershipService } from "../households/transfer-ownership";

type Tx = Transaction<Schema, DatabaseTransaction>;
const define = defineMutatorWithType<
  Schema,
  ZeroAuthContext,
  DatabaseTransaction
>();

function database(tx: Tx): Pick<Database, "transaction"> {
  if (tx.location !== "server") {
    throw Error("Server transaction required");
  }

  return { transaction: (work) => work(tx.dbTransaction.wrappedTransaction) };
}

async function acknowledged<T extends { kind: string }>(
  work: () => Promise<T>,
) {
  const result = await work();

  if (result.kind !== "success") {
    throw new ApplicationError("Household action unavailable", {
      details: { kind: result.kind },
    });
  }

  return result;
}

export const householdServerMutators = {
  create: define(householdCommandSchemas.create, ({ tx, ctx, args }) =>
    acknowledged(() =>
      createHouseholdService({ db: database(tx) })({
        ...args,
        userId: ctx.userId,
      }),
    ),
  ),
  rename: define(householdCommandSchemas.rename, ({ tx, ctx, args }) =>
    acknowledged(() =>
      createRenameHouseholdService({ db: database(tx) })({
        ...args,
        userId: ctx.userId,
      }),
    ),
  ),
  delete: define(householdCommandSchemas.delete, ({ tx, ctx, args }) =>
    acknowledged(() =>
      createDeleteHouseholdService({ db: database(tx) })({
        ...args,
        userId: ctx.userId,
      }),
    ),
  ),
  leave: define(householdCommandSchemas.leave, ({ tx, ctx, args }) =>
    acknowledged(() =>
      createLeaveHouseholdService({ db: database(tx) })({
        ...args,
        userId: ctx.userId,
      }),
    ),
  ),
  removeMember: define(
    householdCommandSchemas.removeMember,
    ({ tx, ctx, args }) =>
      acknowledged(() =>
        createRemoveHouseholdMemberService({ db: database(tx) })({
          ...args,
          userId: ctx.userId,
        }),
      ),
  ),
  transferOwnership: define(
    householdCommandSchemas.transferOwnership,
    ({ tx, ctx, args }) =>
      acknowledged(() =>
        createTransferHouseholdOwnershipService({ db: database(tx) })({
          ...args,
          userId: ctx.userId,
        }),
      ),
  ),
  setModule: define(householdCommandSchemas.setModule, ({ tx, ctx, args }) =>
    acknowledged(() =>
      createSetHouseholdModuleEnabledService({ db: database(tx) })({
        ...args,
        userId: ctx.userId,
      }),
    ),
  ),
  revokeInvite: define(
    householdCommandSchemas.revokeInvite,
    ({ tx, ctx, args }) =>
      acknowledged(() =>
        createRevokeHouseholdInviteService({ db: database(tx) })({
          ...args,
          userId: ctx.userId,
        }),
      ),
  ),
};
