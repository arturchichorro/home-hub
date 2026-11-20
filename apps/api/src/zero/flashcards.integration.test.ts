import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  households,
  listFlashcards,
  lists,
  users,
} from "@home-hub/database/schema";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))("flashcards on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let householdId: string;
  let foreignHousehold: string;
  let userId: string;
  let member: string;
  let outsider: string;
  let listId: string;
  let secondDeck: string;
  let checklist: string;
  let moodboard: string;
  let foreignDeck: string;

  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    householdId = randomUUID();
    foreignHousehold = randomUUID();
    userId = randomUUID();
    member = randomUUID();
    outsider = randomUUID();
    listId = randomUUID();
    secondDeck = randomUUID();
    checklist = randomUUID();
    moodboard = randomUUID();
    foreignDeck = randomUUID();
    await client.db.insert(users).values(
      [userId, member, outsider].map((id) => ({
        id,
        email: `${id}@example.invalid`,
        username: id,
        passwordHash: "fixture",
      })),
    );
    await client.db.insert(households).values([
      { id: householdId, name: "Cards fixture" },
      { id: foreignHousehold, name: "Other" },
    ]);
    await client.db.insert(householdMembers).values(
      [userId, member].map((id) => ({
        id: randomUUID(),
        householdId,
        userId: id,
        role: "member" as const,
        sortKey: 0,
      })),
    );
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "lists", enabled: true });
    await client.db.insert(lists).values([
      {
        id: listId,
        householdId,
        name: "French",
        normalizedName: "french",
        kind: "flashcards",
        sortKey: 1,
      },
      {
        id: secondDeck,
        householdId,
        name: "Second",
        normalizedName: "second",
        kind: "flashcards",
        sortKey: 2,
      },
      {
        id: checklist,
        householdId,
        name: "Shopping",
        normalizedName: "shopping",
        kind: "checklist",
        sortKey: 3,
      },
      {
        id: moodboard,
        householdId,
        name: "Moodboard",
        normalizedName: "moodboard",
        kind: "moodboard",
        sortKey: 4,
      },
      {
        id: foreignDeck,
        householdId: foreignHousehold,
        name: "Foreign",
        normalizedName: "foreign",
        kind: "flashcards",
        sortKey: 1,
      },
    ]);
  });

  const provider = () => createZeroDbProvider({ db: client.db });
  const scope = (cardId: string) => ({
    householdId,
    listId,
    cardId,
    optimisticTimestamp: 1,
  });
  const create = async (
    front = "  Bonjour\nle monde ",
    back = "Hello world",
    actor = userId,
    target = listId,
  ) => {
    const cardId = randomUUID();
    await provider().transaction((tx) =>
      mutators.lists.createFlashcard.fn({
        tx,
        ctx: { userId: actor },
        args: { ...scope(cardId), listId: target, front, back },
      }),
    );
    return cardId;
  };
  const read = (actor = userId, target = listId, household = householdId) =>
    provider().run(
      queries.lists.flashcards.fn({
        ctx: { userId: actor },
        args: { householdId: household, listId: target },
      }),
    );

  it("creates shared duplicate pairs with exact text, stable IDs and newest-first order", async () => {
    const first = await create();
    const second = await create(undefined, undefined, member);
    const rows = await read();
    expect(rows.map((row) => row.id)).toEqual([second, first]);
    expect(rows[0]).toMatchObject({
      front: "  Bonjour\nle monde ",
      back: "Hello world",
      householdId,
      listId,
      deletedAt: null,
    });
    expect(await read(member)).toEqual(rows);
    expect((await read())[0]?.createdAt).toBeGreaterThan(1);
  });

  it("creates Flashcards through the existing list creation contract without changing its name rules", async () => {
    const id = randomUUID();
    await provider().transaction((tx) =>
      mutators.lists.create.fn({
        tx,
        ctx: { userId },
        args: {
          householdId,
          listId: id,
          kind: "flashcards",
          name: "  Ｎew deck ",
          optimisticTimestamp: 1,
        },
      }),
    );
    const [row] = await client.db.select().from(lists).where(eq(lists.id, id));
    expect(row).toMatchObject({
      name: "New deck",
      normalizedName: "new deck",
      kind: "flashcards",
      mediaCount: 0,
    });
  });

  it("merges concurrent front/back patches and uses latest accepted same-field writes", async () => {
    const cardId = await create();
    await Promise.all([
      provider().transaction((tx) =>
        mutators.lists.updateFlashcard.fn({
          tx,
          ctx: { userId },
          args: { ...scope(cardId), changes: { front: "New question" } },
        }),
      ),
      provider().transaction((tx) =>
        mutators.lists.updateFlashcard.fn({
          tx,
          ctx: { userId: member },
          args: { ...scope(cardId), changes: { back: "New answer" } },
        }),
      ),
    ]);
    expect((await read())[0]).toMatchObject({
      front: "New question",
      back: "New answer",
    });
    await provider().transaction((tx) =>
      mutators.lists.updateFlashcard.fn({
        tx,
        ctx: { userId },
        args: { ...scope(cardId), changes: { back: "Latest" } },
      }),
    );
    expect((await read())[0]?.back).toBe("Latest");
  });

  it("serializes concurrent additions and preserves unseen cards in stale reorders", async () => {
    const [first, second] = await Promise.all([
      create("First"),
      create("Second"),
    ]);
    expect(new Set((await read()).map((row) => row.sortKey)).size).toBe(2);
    const unseen = await create("Unseen");
    await provider().transaction((tx) =>
      mutators.lists.reorderFlashcards.fn({
        tx,
        ctx: { userId },
        args: { ...scope(first), orderedIds: [first, second] },
      }),
    );
    expect(new Set((await read()).map((row) => row.id))).toEqual(
      new Set([first, second, unseen]),
    );
    expect((await read()).map((row) => row.id).indexOf(first)).toBeLessThan(
      (await read()).map((row) => row.id).indexOf(second),
    );
  });

  it("rebalances exhausted gaps without dropping unseen rows", async () => {
    const ids = [
      await create("One"),
      await create("Two"),
      await create("Three"),
    ] as const;
    for (const [index, id] of ids.entries()) {
      await client.db
        .update(listFlashcards)
        .set({ sortKey: 3 - index })
        .where(eq(listFlashcards.id, id));
    }
    await provider().transaction((tx) =>
      mutators.lists.reorderFlashcards.fn({
        tx,
        ctx: { userId },
        args: { ...scope(ids[2]), orderedIds: [ids[0], ids[2], ids[1]] },
      }),
    );
    expect((await read()).map((row) => row.id)).toEqual([
      ids[0],
      ids[2],
      ids[1],
    ]);
  });

  it("retains tombstones, refuses stale updates/ID reuse and keeps a duplicate pair", async () => {
    const first = await create();
    const second = await create();
    await provider().transaction((tx) =>
      mutators.lists.deleteFlashcard.fn({
        tx,
        ctx: { userId: member },
        args: scope(first),
      }),
    );
    expect((await read()).map((row) => row.id)).toEqual([second]);
    const [stored] = await client.db
      .select()
      .from(listFlashcards)
      .where(eq(listFlashcards.id, first));
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    await expect(
      provider().transaction((tx) =>
        mutators.lists.updateFlashcard.fn({
          tx,
          ctx: { userId },
          args: { ...scope(first), changes: { front: "Revive" } },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      provider().transaction((tx) =>
        mutators.lists.createFlashcard.fn({
          tx,
          ctx: { userId },
          args: { ...scope(first), front: "Reuse", back: "Answer" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects foreign household/deck IDs and checklist/moodboard mutations in either direction", async () => {
    const id = await create();
    for (const target of [secondDeck, foreignDeck, checklist, moodboard]) {
      await expect(
        provider().transaction((tx) =>
          mutators.lists.updateFlashcard.fn({
            tx,
            ctx: { userId },
            args: { ...scope(id), listId: target, changes: { back: "Forged" } },
          }),
        ),
      ).rejects.toThrow();
    }
    for (const target of [foreignDeck, checklist, moodboard]) {
      await expect(
        create("Wrong parent", "Answer", userId, target),
      ).rejects.toThrow();
    }
    for (const mutation of [
      (
        tx: Parameters<
          Parameters<ReturnType<typeof provider>["transaction"]>[0]
        >[0],
      ) =>
        mutators.lists.addItem.fn({
          tx,
          ctx: { userId },
          args: {
            householdId,
            listId,
            itemId: randomUUID(),
            name: "Not a checklist",
            optimisticTimestamp: 1,
          },
        }),
      (
        tx: Parameters<
          Parameters<ReturnType<typeof provider>["transaction"]>[0]
        >[0],
      ) =>
        mutators.lists.reorderItems.fn({
          tx,
          ctx: { userId },
          args: {
            householdId,
            listId,
            itemId: id,
            status: "active",
            orderedItemIds: [id],
            optimisticUpdatedAt: 1,
          },
        }),
    ]) {
      await expect(provider().transaction(mutation)).rejects.toThrow();
    }
    await expect(
      provider().transaction((tx) =>
        mutators.lists.reorderFlashcards.fn({
          tx,
          ctx: { userId },
          args: { ...scope(id), orderedIds: [id, randomUUID()] },
        }),
      ),
    ).rejects.toThrow();
  });

  it("requires current membership and enabled Lists for every query/write", async () => {
    const id = await create();
    expect(await read(outsider)).toEqual([]);
    expect(await read(userId, foreignDeck, foreignHousehold)).toEqual([]);
    await expect(create("No access", "Answer", outsider)).rejects.toThrow();
    await client.db
      .delete(householdMembers)
      .where(eq(householdMembers.userId, member));
    expect(await read(member)).toEqual([]);
    await expect(
      provider().transaction((tx) =>
        mutators.lists.deleteFlashcard.fn({
          tx,
          ctx: { userId: member },
          args: scope(id),
        }),
      ),
    ).rejects.toThrow();
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(
        and(
          eq(householdModuleSettings.householdId, householdId),
          eq(householdModuleSettings.moduleKey, "lists"),
        ),
      );
    expect(await read()).toEqual([]);
    await expect(create()).rejects.toThrow();
    await expect(
      provider().transaction((tx) =>
        mutators.lists.updateFlashcard.fn({
          tx,
          ctx: { userId },
          args: { ...scope(id), changes: { back: "Forbidden" } },
        }),
      ),
    ).rejects.toThrow();
  });

  it("hides a deleted deck but retains its cards, and serializes deletion with additions", async () => {
    await create();
    await Promise.allSettled([
      provider().transaction((tx) =>
        mutators.lists.delete.fn({
          tx,
          ctx: { userId },
          args: { householdId, listId, optimisticDeletedAt: 2 },
        }),
      ),
      create("Concurrent"),
    ]);
    expect(await read()).toEqual([]);
    expect(
      (
        await client.db
          .select()
          .from(listFlashcards)
          .where(eq(listFlashcards.listId, listId))
      ).length,
    ).toBeGreaterThan(0);
    await expect(create()).rejects.toThrow();
  });

  it("uses a bounded library preview while preserving older query contracts", async () => {
    for (let n = 0; n < 8; n++) {
      await create(`Question ${n}`);
    }
    const library = await provider().run(
      queries.lists.libraryCards.fn({ ctx: { userId }, args: { householdId } }),
    );
    const deck = library.find((row) => row.id === listId);
    expect(deck?.cards).toHaveLength(4);
    expect(deck?.cards[0]?.front).toBe("Question 7");
    expect(deck?.items).toEqual([]);
    const legacy = await provider().run(
      queries.lists.libraryPreview.fn({
        ctx: { userId },
        args: { householdId },
      }),
    );
    expect(legacy[0]).not.toHaveProperty("cards");
    expect(
      await provider().run(
        queries.lists.libraryCards.fn({
          ctx: { userId: outsider },
          args: { householdId },
        }),
      ),
    ).toEqual([]);
  });

  it("enforces household-qualified foreign keys and bounded nonblank text in PostgreSQL", async () => {
    for (const patch of [
      { householdId: foreignHousehold },
      { listId: foreignDeck },
      { front: "" },
      { back: " \n\t" },
      { front: "a".repeat(10001) },
    ]) {
      await expect(
        client.db.insert(listFlashcards).values({
          id: randomUUID(),
          householdId,
          listId,
          front: "Question",
          back: "Answer",
          sortKey: 1,
          ...patch,
        }),
      ).rejects.toThrow();
    }
    expect(
      (
        await client.db.execute(
          sql`SELECT tablename FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='list_flashcards'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
});
