import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  contactEntryMutationSchema,
  contactProfileMutationSchema,
} from "@home-hub/shared/zero/contact-mutators";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import type { Schema } from "@home-hub/shared/zero/schema";
import {
  ApplicationError,
  defineMutatorWithType,
  type Transaction,
} from "@rocicorp/zero";
import { ContactsError, createContactsServices } from "../contacts/records";

type Tx = Transaction<Schema, DatabaseTransaction>;
const define = defineMutatorWithType<
  Schema,
  ZeroAuthContext,
  DatabaseTransaction
>();

function services(tx: Tx) {
  if (tx.location !== "server") {
    throw Error("Server transaction required");
  }

  // Domain changes and Zero's acknowledgement share the same transaction.
  const db: Pick<Database, "transaction"> = {
    transaction: (work) => work(tx.dbTransaction.wrappedTransaction),
  };

  return createContactsServices({ db });
}

async function execute<T>(write: () => Promise<T>) {
  try {
    return { record: await write() };
  } catch (error) {
    if (error instanceof ContactsError) {
      throw new ApplicationError(error.message, {
        details: { status: error.status, record: error.record },
      });
    }

    throw error;
  }
}

// Zero's documented server overrides: optimistic recipes stay shared, while
// authoritative writes own locking, private retry metadata and conflict details.
export const contactServerMutators = {
  profile: define(contactProfileMutationSchema, ({ tx, ctx, args }) =>
    execute(() => services(tx).writeProfile({ ...args, userId: ctx.userId })),
  ),
  entry: define(contactEntryMutationSchema, ({ tx, ctx, args }) =>
    execute(() => services(tx).writeEntry({ ...args, userId: ctx.userId })),
  ),
};
