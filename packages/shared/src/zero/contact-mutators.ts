import { defineMutatorWithType } from "@rocicorp/zero";
import * as z from "zod";
import { contactWriteSchema, entryWriteSchema } from "../contacts";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const timestamp = z.number().finite().nonnegative();

export const contactProfileMutationSchema = contactWriteSchema.extend({
  optimisticTimestamp: timestamp,
});

export const contactEntryMutationSchema = entryWriteSchema.extend({
  optimisticTimestamp: timestamp,
});

// The server implementations run the same commands against the wrapped Zero
// transaction, with authoritative authorization, revisions and private retry IDs.
// Client replay must not turn a stale local revision into a permanent rejection:
// skip that optimistic change and let the server decide and return conflict data.
export const contactMutators = {
  profile: define(contactProfileMutationSchema, async ({ tx, args }) => {
    if (tx.location !== "client") {
      throw Error("Contacts requires the server transaction implementation");
    }

    const row = await tx.run(zql.contacts.where("id", args.contactId).one());
    if (
      (row && row.householdId !== args.householdId) ||
      (row ? (row.version ?? 1) : null) !== args.expectedVersion
    ) {
      return;
    }

    const fields = args.fields;
    if (
      row?.archived &&
      (row.name !== fields.name ||
        JSON.stringify(row.details) !== JSON.stringify(fields.details))
    ) {
      return;
    }

    const values = {
      ...fields,
      normalizedName: fields.name.normalize("NFKC").toLowerCase(),
      searchText: [
        fields.name,
        ...fields.details.flatMap((detail) => [detail.label, detail.value]),
      ]
        .join("\n")
        .normalize("NFKC"),
      version: (row?.version ?? 0) + 1,
      updatedAt: args.optimisticTimestamp,
    };

    if (row) {
      await tx.mutate.contacts.update({ id: row.id, ...values });
    } else if (!fields.archived) {
      await tx.mutate.contacts.insert({
        id: args.contactId,
        householdId: args.householdId,
        createdAt: args.optimisticTimestamp,
        ...values,
      });
    }
  }),
  entry: define(contactEntryMutationSchema, async ({ tx, args, ctx }) => {
    if (tx.location !== "client") {
      throw Error("Contacts requires the server transaction implementation");
    }

    const row = await tx.run(
      zql.contactEntries.where("id", args.entryId).one(),
    );
    if (
      row?.deletedAt ||
      (row && row.householdId !== args.householdId) ||
      (row ? (row.version ?? 1) : null) !== args.expectedVersion
    ) {
      return;
    }

    if (args.action === "delete") {
      if (row) {
        await tx.mutate.contactEntries.update({
          id: row.id,
          deletedAt: args.optimisticTimestamp,
          version: (row.version ?? 1) + 1,
          updatedAt: args.optimisticTimestamp,
          lastEditedBy: ctx.userId,
        });
      }
      return;
    }

    const existing = await tx.run(
      zql.contactEntryPeople.where("entryId", args.entryId),
    );
    const previous = new Set(existing.map((person) => person.contactId));
    for (const id of args.fields.contactIds) {
      const person = await tx.run(
        zql.contacts
          .where("id", id)
          .where("householdId", args.householdId)
          .one(),
      );
      if (!person || (person.archived && !previous.has(id))) {
        return;
      }
    }

    const photos = await tx.run(
      zql.contactMedia
        .where("entryId", args.entryId)
        .where("published", true)
        .where("deletedAt", "IS", null),
    );
    const published = Boolean(args.fields.note.trim() || photos.length);
    if (!published && (args.action !== "prepare-photo" || row?.published)) {
      return;
    }

    const values = {
      entryOn: args.fields.entryOn,
      note: args.fields.note,
      published,
      version: (row?.version ?? 0) + 1,
      lastEditedBy: ctx.userId,
      updatedAt: args.optimisticTimestamp,
    };

    if (row) {
      await tx.mutate.contactEntries.update({ id: row.id, ...values });
    } else {
      await tx.mutate.contactEntries.insert({
        id: args.entryId,
        householdId: args.householdId,
        createdBy: ctx.userId,
        createdAt: args.optimisticTimestamp,
        deletedAt: null,
        ...values,
      });
    }

    for (const person of existing) {
      if (!args.fields.contactIds.includes(person.contactId)) {
        await tx.mutate.contactEntryPeople.delete({
          entryId: args.entryId,
          contactId: person.contactId,
        });
      }
    }

    for (const id of args.fields.contactIds) {
      if (!previous.has(id)) {
        await tx.mutate.contactEntryPeople.insert({
          householdId: args.householdId,
          entryId: args.entryId,
          contactId: id,
        });
      }
    }
  }),
};
