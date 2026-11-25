import { createHash } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  contactEntries,
  contactEntryPeople,
  contactMedia,
  contacts,
  households,
  media,
} from "@home-hub/database/schema";
import {
  type ContactEntrySnapshot,
  type ContactEntryWrite,
  type ContactSnapshot,
  type ContactWrite,
  contactDetailsSchema,
} from "@home-hub/shared/contacts";
import { calendarDate } from "@home-hub/shared/habits";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";

export class ContactsError extends Error {
  constructor(
    readonly status: 401 | 403 | 404 | 409 | 422,
    message: string,
    readonly record: ContactSnapshot | ContactEntrySnapshot | null = null,
  ) {
    super(message);
  }
}

export type ContactsActor = { householdId: string; userId: string };

export async function authorizeContacts(
  tx: DatabaseTransaction,
  input: ContactsActor,
  write = false,
) {
  if (!(await findActiveUser(tx, input.userId))) {
    throw new ContactsError(401, "Unauthorized");
  }
  const [household] = await tx
    .select({ id: households.id })
    .from(households)
    .where(
      and(eq(households.id, input.householdId), isNull(households.deletedAt)),
    )
    .for("share");
  if (
    !household ||
    !(await findHouseholdMembershipForShare(tx, input)) ||
    !(await findEnabledHouseholdModuleForShare(tx, {
      householdId: input.householdId,
      moduleKey: "contacts",
    }))
  ) {
    throw new ContactsError(403, "Contacts unavailable");
  }
  if (write) {
    // One consistent lock order for archive, people edits, profile/entry writes and media.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.householdId}, 65701))`,
    );
  }
}

function profileSnapshot(row: typeof contacts.$inferSelect): ContactSnapshot {
  return {
    id: row.id,
    version: row.version,
    fields: {
      name: row.name,
      details: contactDetailsSchema.parse(row.details),
      archived: row.archived,
    },
  };
}

async function entrySnapshot(
  tx: DatabaseTransaction,
  row: typeof contactEntries.$inferSelect,
): Promise<ContactEntrySnapshot> {
  const people = await tx
    .select({ id: contactEntryPeople.contactId })
    .from(contactEntryPeople)
    .where(
      and(
        eq(contactEntryPeople.householdId, row.householdId),
        eq(contactEntryPeople.entryId, row.id),
      ),
    )
    .orderBy(contactEntryPeople.contactId);
  return {
    id: row.id,
    version: row.version,
    fields: {
      entryOn: row.entryOn,
      note: row.note,
      contactIds: people.map((p) => p.id),
    },
  };
}

export async function entryWritable(
  tx: DatabaseTransaction,
  householdId: string,
  entryId: string,
) {
  const [person] = await tx
    .select({ id: contacts.id })
    .from(contactEntryPeople)
    .innerJoin(
      contacts,
      and(
        eq(contacts.id, contactEntryPeople.contactId),
        eq(contacts.householdId, contactEntryPeople.householdId),
      ),
    )
    .where(
      and(
        eq(contactEntryPeople.householdId, householdId),
        eq(contactEntryPeople.entryId, entryId),
        eq(contacts.archived, false),
      ),
    )
    .limit(1);
  return Boolean(person);
}

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createContactsServices({
  db,
  now = () => new Date(),
}: {
  db: Pick<Database, "transaction">;
  now?: () => Date;
}) {
  return {
    readProfile: (input: ContactsActor & { contactId: string }) =>
      db.transaction(async (tx) => {
        await authorizeContacts(tx, input);
        const [row] = await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.id, input.contactId),
              eq(contacts.householdId, input.householdId),
            ),
          )
          .for("share");
        return row ? profileSnapshot(row) : null;
      }),
    writeProfile: (input: ContactsActor & ContactWrite) =>
      db.transaction(async (tx) => {
        await authorizeContacts(tx, input, true);
        const [row] = await tx
          .select()
          .from(contacts)
          .where(eq(contacts.id, input.contactId))
          .for("update");
        if (row && row.householdId !== input.householdId) {
          throw new ContactsError(404, "Contact unavailable");
        }
        const fingerprint = hash(input.fields);
        if (
          row &&
          row.lastWriteId === input.writeId &&
          row.lastWriteHash === fingerprint
        ) {
          return profileSnapshot(row);
        }
        if (
          (row?.version ?? null) !== input.expectedVersion ||
          (row && input.expectedVersion === null)
        ) {
          throw new ContactsError(
            409,
            "Contact changed elsewhere",
            row ? profileSnapshot(row) : null,
          );
        }
        if (
          (!row && input.fields.archived) ||
          (row?.archived &&
            (row.name !== input.fields.name ||
              JSON.stringify(row.details) !==
                JSON.stringify(input.fields.details)))
        ) {
          throw new ContactsError(
            422,
            "Restore the contact before editing its profile",
          );
        }
        const fields = input.fields;
        const values = {
          name: fields.name,
          details: fields.details,
          archived: fields.archived,
          normalizedName: fields.name.normalize("NFKC").toLowerCase(),
          searchText: [
            fields.name,
            ...fields.details.flatMap((d) => [d.label, d.value]),
          ]
            .join("\n")
            .normalize("NFKC"),
          lastWriteId: input.writeId,
          lastWriteHash: fingerprint,
          updatedAt: now(),
        };
        if (row) {
          const [saved] = await tx
            .update(contacts)
            .set({ ...values, version: row.version + 1 })
            .where(eq(contacts.id, row.id))
            .returning();
          if (!saved) {
            throw Error("Contact update failed");
          }
          return profileSnapshot(saved);
        }
        const [saved] = await tx
          .insert(contacts)
          .values({
            ...values,
            id: input.contactId,
            householdId: input.householdId,
            createdAt: now(),
          })
          .returning();
        if (!saved) {
          throw Error("Contact insert failed");
        }
        return profileSnapshot(saved);
      }),
    readEntry: (input: ContactsActor & { entryId: string }) =>
      db.transaction(async (tx) => {
        await authorizeContacts(tx, input);
        const [row] = await tx
          .select()
          .from(contactEntries)
          .where(
            and(
              eq(contactEntries.id, input.entryId),
              eq(contactEntries.householdId, input.householdId),
              isNull(contactEntries.deletedAt),
            ),
          )
          .for("share");
        return row ? entrySnapshot(tx, row) : null;
      }),
    writeEntry: (input: ContactsActor & ContactEntryWrite) =>
      db.transaction(async (tx) => {
        await authorizeContacts(tx, input, true);
        const [row] = await tx
          .select()
          .from(contactEntries)
          .where(eq(contactEntries.id, input.entryId))
          .for("update");
        if (row && row.householdId !== input.householdId) {
          throw new ContactsError(404, "Entry unavailable");
        }
        const fields = {
          ...input.fields,
          contactIds: [...input.fields.contactIds].sort(),
        };
        const fingerprint = hash({
          fields,
          action: input.action,
          timeZone: input.timeZone,
        });
        if (
          row &&
          row.lastWriteId === input.writeId &&
          row.lastWriteHash === fingerprint
        ) {
          return row.deletedAt ? null : entrySnapshot(tx, row);
        }
        const current =
          row && !row.deletedAt ? await entrySnapshot(tx, row) : null;
        if (
          row?.deletedAt ||
          (row?.version ?? null) !== input.expectedVersion
        ) {
          throw new ContactsError(409, "Entry changed elsewhere", current);
        }
        if (row && !(await entryWritable(tx, input.householdId, row.id))) {
          throw new ContactsError(
            422,
            "Restore a linked contact before changing this entry",
          );
        }
        const people = await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.householdId, input.householdId),
              inArray(contacts.id, fields.contactIds),
            ),
          )
          .orderBy(contacts.id)
          .for("share");
        const existing = new Set(current?.fields.contactIds ?? []);
        if (
          people.length !== fields.contactIds.length ||
          people.some((p) => p.archived && !existing.has(p.id))
        ) {
          throw new ContactsError(422, "Choose available contacts");
        }
        if (
          (!row || row.entryOn !== fields.entryOn) &&
          fields.entryOn > calendarDate(now(), input.timeZone)
        ) {
          throw new ContactsError(422, "Entries cannot be future-dated");
        }
        if (input.action === "delete") {
          if (!row) {
            throw new ContactsError(422, "Entry unavailable");
          }
          await tx
            .update(contactEntries)
            .set({
              deletedAt: now(),
              version: row.version + 1,
              updatedAt: now(),
              lastEditedBy: input.userId,
              lastWriteId: input.writeId,
              lastWriteHash: fingerprint,
            })
            .where(eq(contactEntries.id, row.id));
          return null;
        }
        const [photo] = row
          ? await tx
              .select({ id: contactMedia.id })
              .from(contactMedia)
              .innerJoin(
                media,
                and(
                  eq(media.id, contactMedia.mediaId),
                  eq(media.householdId, contactMedia.householdId),
                ),
              )
              .where(
                and(
                  eq(contactMedia.entryId, row.id),
                  eq(contactMedia.published, true),
                  isNull(contactMedia.deletedAt),
                  isNull(media.deletedAt),
                ),
              )
              .limit(1)
          : [];
        if (
          !fields.note.trim() &&
          !photo &&
          !(input.action === "prepare-photo" && !row?.published)
        ) {
          throw new ContactsError(
            422,
            "An entry needs text or a picture. Confirm deletion to remove it everywhere.",
          );
        }
        const values = {
          entryOn: fields.entryOn,
          note: fields.note,
          published: Boolean(fields.note.trim() || photo),
          lastEditedBy: input.userId,
          lastWriteId: input.writeId,
          lastWriteHash: fingerprint,
          updatedAt: now(),
        };
        let saved: typeof contactEntries.$inferSelect | undefined;
        if (row) {
          [saved] = await tx
            .update(contactEntries)
            .set({ ...values, version: row.version + 1 })
            .where(eq(contactEntries.id, row.id))
            .returning();
          await tx
            .delete(contactEntryPeople)
            .where(eq(contactEntryPeople.entryId, row.id));
        } else {
          [saved] = await tx
            .insert(contactEntries)
            .values({
              ...values,
              id: input.entryId,
              householdId: input.householdId,
              createdBy: input.userId,
              createdAt: now(),
            })
            .returning();
        }
        if (!saved) {
          throw Error("Entry write failed");
        }
        const entryId = saved.id;
        await tx.insert(contactEntryPeople).values(
          fields.contactIds.map((contactId) => ({
            householdId: input.householdId,
            entryId,
            contactId,
          })),
        );
        return entrySnapshot(tx, saved);
      }),
  };
}
