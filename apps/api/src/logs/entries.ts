import type { Database, DatabaseTransaction } from "@home-hub/database";
import { households, logEntries, logs } from "@home-hub/database/schema";
import { calendarDate } from "@home-hub/shared/habits";
import {
  cleanLogNote,
  type LogEntrySnapshot,
  type LogEntryWrite,
} from "@home-hub/shared/logs";
import { and, eq, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";

type Scope = {
  householdId: string;
  logId: string;
  userId: string;
  entryOn: string;
};

export class LogEntryError extends Error {
  constructor(
    readonly status: 401 | 403 | 404 | 409 | 422,
    message: string,
    readonly entry: LogEntrySnapshot | null = null,
  ) {
    super(message);
  }
}

export function entrySnapshot(
  row: typeof logEntries.$inferSelect | null | undefined,
): LogEntrySnapshot | null {
  return row
    ? {
        id: row.id,
        entryOn: row.entryOn,
        note: row.note,
        version: row.version,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        createdBy: row.createdBy,
        lastEditedBy: row.lastEditedBy,
      }
    : null;
}

async function authorize(
  tx: DatabaseTransaction,
  input: Scope,
  lock: "share" | "update",
) {
  if (!(await findActiveUser(tx, input.userId))) {
    throw new LogEntryError(401, "Unauthorized");
  }

  const [h] = await tx
    .select({ id: households.id })
    .from(households)
    .where(
      and(eq(households.id, input.householdId), isNull(households.deletedAt)),
    )
    .for("share");

  if (
    !h ||
    !(await findHouseholdMembershipForShare(tx, input)) ||
    !(await findEnabledHouseholdModuleForShare(tx, {
      householdId: input.householdId,
      moduleKey: "logs",
    }))
  ) {
    throw new LogEntryError(403, "Forbidden");
  }

  const [l] = await tx
    .select({ id: logs.id })
    .from(logs)
    .where(
      and(
        eq(logs.id, input.logId),
        eq(logs.householdId, input.householdId),
        isNull(logs.deletedAt),
      ),
    )
    .for(lock);

  if (!l) {
    throw new LogEntryError(404, "Log unavailable");
  }
}

function current(tx: DatabaseTransaction, input: Scope) {
  return tx
    .select()
    .from(logEntries)
    .where(
      and(
        eq(logEntries.householdId, input.householdId),
        eq(logEntries.logId, input.logId),
        eq(logEntries.entryOn, input.entryOn),
        isNull(logEntries.deletedAt),
      ),
    )
    .limit(1);
}

export function createLogEntryServices({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}) {
  return {
    read: (input: Scope) =>
      db.transaction(async (tx) => {
        await authorize(tx, input, "share");

        return { entry: entrySnapshot((await current(tx, input))[0]) };
      }),

    write: (input: Scope & LogEntryWrite) =>
      db.transaction(async (tx) => {
        await authorize(tx, input, "update"); // Also serializes two first writes for the same day.

        const active = (await current(tx, input))[0];
        const note = cleanLogNote(input.note);
        const [byId] = await tx
          .select()
          .from(logEntries)
          .where(eq(logEntries.id, input.entryId))
          .limit(1);

        if (
          byId &&
          byId.householdId === input.householdId &&
          byId.logId === input.logId &&
          byId.entryOn === input.entryOn &&
          byId.lastWriteId === input.writeId &&
          ((!note && byId.deletedAt !== null) ||
            (note && byId.deletedAt === null && byId.note === note)) &&
          (!active || active.id === byId.id)
        ) {
          return { entry: entrySnapshot(active) };
        }

        const conflict = () => {
          throw new LogEntryError(
            409,
            "This entry changed elsewhere.",
            entrySnapshot(active),
          );
        };

        if (input.expectedVersion === null) {
          if (active || byId) {
            return conflict();
          }

          if (!note) {
            return { entry: null };
          }

          if (input.entryOn > calendarDate(now(), input.timeZone)) {
            throw new LogEntryError(422, "New entries cannot be future-dated.");
          }

          const date = now();
          const [row] = await tx
            .insert(logEntries)
            .values({
              id: input.entryId,
              householdId: input.householdId,
              logId: input.logId,
              entryOn: input.entryOn,
              note,
              version: 1,
              createdBy: input.userId,
              lastEditedBy: input.userId,
              lastWriteId: input.writeId,
              createdAt: date,
              updatedAt: date,
            })
            .returning();

          return { entry: entrySnapshot(row) };
        }

        if (
          !active ||
          active.id !== input.entryId ||
          active.version !== input.expectedVersion
        ) {
          return conflict();
        }

        const date = now();
        const [row] = await tx
          .update(logEntries)
          .set({
            ...(note ? { note } : { deletedAt: date }),
            version: active.version + 1,
            updatedAt: date,
            lastEditedBy: input.userId,
            lastWriteId: input.writeId,
          })
          .where(eq(logEntries.id, active.id))
          .returning();

        return { entry: note ? entrySnapshot(row) : null };
      }),
  };
}

export type LogEntryServices = ReturnType<typeof createLogEntryServices>;
