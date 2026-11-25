import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  calendarItems,
  calendarMedia,
  contactEntries,
  contactEntryPeople,
  contactMedia,
  contacts,
  exerciseMedia,
  exercises,
  householdMembers,
  householdModuleSettings,
  households,
  listMedia,
  lists,
  media,
  recipeMedia,
  recipes,
  users,
} from "@home-hub/database/schema";
import { householdModuleCatalog } from "@home-hub/shared/modules";
import type { AttachmentRemovalInput } from "@home-hub/shared/zero/attachment-mutators";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;
const kinds = [
  "recipe",
  "calendar",
  "moodboard",
  "exercise",
  "contact-profile",
  "contact-entry",
] as const;
const tables = {
  recipe: recipeMedia,
  calendar: calendarMedia,
  moodboard: listMedia,
  exercise: exerciseMedia,
  "contact-profile": contactMedia,
  "contact-entry": contactMedia,
};

describe.runIf(Boolean(url))("attachment removal through Zero", () => {
  let client: ReturnType<typeof createDbClient>;
  let householdId: string;
  let userId: string;
  let outsider: string;

  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Owned disposable test database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => client?.close());
  beforeEach(async () => {
    householdId = randomUUID();
    userId = randomUUID();
    outsider = randomUUID();
    await client.db.insert(users).values(
      [userId, outsider].map((id) => ({
        id,
        email: `${id}@example.invalid`,
        username: id,
        passwordHash: "fixture",
      })),
    );
    await client.db
      .insert(households)
      .values({ id: householdId, name: "Attachment fixture" });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "member",
      sortKey: 0,
    });
    await client.db.insert(householdModuleSettings).values(
      householdModuleCatalog.map((module) => ({
        householdId,
        moduleKey: module.key,
        enabled: true,
      })),
    );
  });

  async function fixture(kind: AttachmentRemovalInput["kind"]) {
    const parentId = randomUUID();
    const attachmentId = randomUUID();
    const assetId = randomUUID();
    await client.db.insert(media).values({
      id: assetId,
      householdId,
      kind: "image",
      objectKey: `fixture/${assetId}`,
      contentType: "image/jpeg",
      byteSize: 64,
      width: 4,
      height: 4,
      confirmedAt: new Date(),
    });
    if (kind === "recipe") {
      await client.db
        .insert(recipes)
        .values({ id: parentId, householdId, title: "Recipe", sortKey: 0 });
      await client.db.insert(recipeMedia).values({
        id: attachmentId,
        householdId,
        recipeId: parentId,
        mediaId: assetId,
        sortKey: 0,
      });
    } else if (kind === "calendar") {
      await client.db.insert(calendarItems).values({
        id: parentId,
        householdId,
        day: "2026-01-01",
        title: "Calendar",
        sortKey: 0,
      });
      await client.db.insert(calendarMedia).values({
        id: attachmentId,
        householdId,
        itemId: parentId,
        mediaId: assetId,
        sortKey: 0,
      });
    } else if (kind === "moodboard") {
      await client.db.insert(lists).values({
        id: parentId,
        householdId,
        name: parentId,
        normalizedName: parentId,
        kind: "moodboard",
        mediaCount: 1,
        sortKey: 0,
      });
      await client.db.insert(listMedia).values({
        id: attachmentId,
        householdId,
        listId: parentId,
        mediaId: assetId,
        sortKey: 0,
      });
    } else if (kind === "exercise") {
      await client.db.insert(exercises).values({
        id: parentId,
        householdId,
        name: parentId,
        normalizedName: parentId,
        unit: "reps",
        load: "single",
        unilateral: false,
      });
      await client.db.insert(exerciseMedia).values({
        id: attachmentId,
        householdId,
        exerciseId: parentId,
        mediaId: assetId,
        sortKey: 0,
      });
    } else {
      const contactId = kind === "contact-profile" ? parentId : randomUUID();
      await client.db.insert(contacts).values({
        id: contactId,
        householdId,
        name: "Person",
        normalizedName: "person",
        searchText: "Person",
        lastWriteId: randomUUID(),
        lastWriteHash: "fixture",
      });
      if (kind === "contact-entry") {
        await client.db.transaction(async (tx) => {
          await tx.insert(contactEntries).values({
            id: parentId,
            householdId,
            entryOn: "2026-01-01",
            note: "Caption",
            published: true,
            createdBy: userId,
            lastEditedBy: userId,
            lastWriteId: randomUUID(),
            lastWriteHash: "fixture",
          });
          await tx
            .insert(contactEntryPeople)
            .values({ householdId, entryId: parentId, contactId });
        });
      }
      await client.db.insert(contactMedia).values({
        id: attachmentId,
        householdId,
        parentId,
        contactId: kind === "contact-profile" ? parentId : null,
        entryId: kind === "contact-entry" ? parentId : null,
        mediaId: assetId,
        published: true,
        sortKey: 0,
      });
    }
    return {
      kind,
      householdId,
      parentId,
      attachmentId,
      optimisticTimestamp: 1,
      assetId,
    };
  }

  const run = (
    args: AttachmentRemovalInput & { optimisticTimestamp: number },
    actor = userId,
  ) =>
    createZeroDbProvider({ db: client.db }).transaction((tx) =>
      mutateWithHabitWorkouts(tx, actor, "attachments.remove", args),
    );
  const command = ({
    assetId: _asset,
    ...args
  }: Awaited<ReturnType<typeof fixture>>) => args;
  const attachment = async (
    kind: AttachmentRemovalInput["kind"],
    id: string,
  ) => {
    const table = tables[kind];
    return (
      await client.db
        .select({ deletedAt: table.deletedAt })
        .from(table)
        .where(eq(table.id, id))
    )[0];
  };

  it.each(kinds)(
    "unlinks %s idempotently while retaining the stored asset",
    async (kind) => {
      const f = await fixture(kind);
      expect(await run(command(f))).toEqual({ kind: "success" });
      expect(
        (await attachment(kind, f.attachmentId))?.deletedAt,
      ).toBeInstanceOf(Date);
      expect(await run(command(f))).toEqual({ kind: "success" });
      expect(
        (
          await client.db.select().from(media).where(eq(media.id, f.assetId))
        )[0],
      ).toMatchObject({ deletedAt: null, confirmedAt: expect.any(Date) });
      if (kind === "moodboard") {
        expect(
          (
            await client.db.select().from(lists).where(eq(lists.id, f.parentId))
          )[0]?.mediaCount,
        ).toBe(0);
      }
    },
  );

  it.each(kinds)(
    "rejects outsider and disabled-module removal of %s without touching metadata",
    async (kind) => {
      const f = await fixture(kind);
      await expect(run(command(f), outsider)).rejects.toMatchObject({
        details: { kind: "forbidden" },
      });
      const moduleKey = kind.startsWith("contact-")
        ? "contacts"
        : kind === "moodboard"
          ? "lists"
          : kind === "exercise"
            ? "workouts"
            : kind === "recipe"
              ? "recipes"
              : "calendar";
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, moduleKey),
          ),
        );
      await expect(run(command(f))).rejects.toMatchObject({
        details: { kind: "forbidden" },
      });
      expect(await attachment(kind, f.attachmentId)).toEqual({
        deletedAt: null,
      });
    },
  );

  it.each(kinds)(
    "scopes %s attachments to their exact parent",
    async (kind) => {
      const first = await fixture(kind);
      const second = await fixture(kind);
      await run({ ...command(first), parentId: second.parentId });
      expect(await attachment(kind, first.attachmentId)).toEqual({
        deletedAt: null,
      });
    },
  );

  it("preserves the last-content guard and rolls attachment changes back with Zero's transaction", async () => {
    const f = await fixture("contact-entry");
    await client.db
      .update(contactEntries)
      .set({ note: "" })
      .where(eq(contactEntries.id, f.parentId));
    await expect(run(command(f))).rejects.toMatchObject({
      details: { kind: "invalid_action" },
    });
    expect(await attachment(f.kind, f.attachmentId)).toEqual({
      deletedAt: null,
    });
    await client.db
      .update(contactEntries)
      .set({ note: "Keep this text" })
      .where(eq(contactEntries.id, f.parentId));
    await expect(
      createZeroDbProvider({ db: client.db }).transaction(async (tx) => {
        await mutateWithHabitWorkouts(
          tx,
          userId,
          "attachments.remove",
          command(f),
        );
        throw Error("fixture rollback");
      }),
    ).rejects.toThrow("fixture rollback");
    expect(await attachment(f.kind, f.attachmentId)).toEqual({
      deletedAt: null,
    });
    await run(command(f));
    expect(
      (
        await client.db
          .select()
          .from(contactEntries)
          .where(eq(contactEntries.id, f.parentId))
      )[0],
    ).toMatchObject({ note: "Keep this text", deletedAt: null });
  });
});
