import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  calendarItems,
  calendarPeople,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;
describe.runIf(Boolean(url))("shared calendar on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let householdId: string;
  let userId: string;
  let other: string;
  let outsider: string;
  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => client?.close());
  beforeEach(async () => {
    householdId = randomUUID();
    userId = randomUUID();
    other = randomUUID();
    outsider = randomUUID();
    await client.db.insert(users).values(
      [userId, other, outsider].map((id) => ({
        id,
        username: id,
        email: `${id}@example.invalid`,
        passwordHash: "fixture",
      })),
    );
    await client.db
      .insert(households)
      .values({ id: householdId, name: "Calendar fixture" });
    await client.db.insert(householdMembers).values(
      [userId, other].map((id) => ({
        id: randomUUID(),
        householdId,
        userId: id,
        role: "member" as const,
        sortKey: 0,
      })),
    );
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "calendar", enabled: true });
  });
  const run = (
    name: string,
    args: Parameters<typeof mutateWithHabitWorkouts>[3],
    actor = userId,
  ) =>
    createZeroDbProvider({ db: client.db }).transaction((tx) =>
      mutateWithHabitWorkouts(tx, actor, `calendar.${name}`, args),
    );
  const base = (itemId: string) => ({
    householdId,
    itemId,
    optimisticTimestamp: 1,
  });
  const create = async (day = "2026-11-11", title = "Dinner") => {
    const itemId = randomUUID();
    await run("create", {
      ...base(itemId),
      day,
      title,
      note: "First line\nSecond line",
    });
    return itemId;
  };
  const month = (actor = userId, anchor = "2026-11-01") =>
    createZeroDbProvider({ db: client.db }).run(
      queries.calendar.month.fn({
        ctx: { userId: actor },
        args: { householdId, month: anchor },
      }),
    );
  const get = (itemId: string, actor = userId) =>
    createZeroDbProvider({ db: client.db }).run(
      queries.calendar.item.fn({
        ctx: { userId: actor },
        args: { householdId, itemId },
      }),
    );

  it("allows duplicate titles, exact date labels and shared member editing", async () => {
    const first = await create();
    const second = await create();
    expect((await month()).map((r) => r.id)).toEqual([first, second]);
    await run(
      "update",
      { ...base(first), changes: { title: "Shared edit" } },
      other,
    );
    expect(await get(first)).toMatchObject({
      title: "Shared edit",
      day: "2026-11-11",
      note: "First line\nSecond line",
    });
    expect(await month(outsider)).toEqual([]);
    expect(await get(first, outsider)).toBeUndefined();
    await expect(
      run("update", { ...base(first), changes: { title: "Forged" } }, outsider),
    ).rejects.toThrow();
  });
  it("merges independent fields and lets the latest write to the same field win", async () => {
    const id = await create();
    await Promise.all([
      run("update", { ...base(id), changes: { title: "Title edit" } }),
      run(
        "update",
        { ...base(id), changes: { note: "Other member note" } },
        other,
      ),
    ]);
    expect(await get(id)).toMatchObject({
      title: "Title edit",
      note: "Other member note",
    });
    await run("update", { ...base(id), changes: { note: "Latest" } }, other);
    expect(await get(id)).toMatchObject({
      title: "Title edit",
      note: "Latest",
    });
  });
  it("hides departed labels, preserves them through other edits and restores on account rejoin", async () => {
    const id = await create();
    await run("person", { ...base(id), userId: other, selected: true });
    expect((await get(id))?.people[0]?.member?.user?.username).toBe(other);
    await client.db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, other),
        ),
      );
    expect((await get(id))?.people).toEqual([]);
    expect(await month(other)).toEqual([]);
    await expect(
      run("update", { ...base(id), changes: { title: "Left" } }, other),
    ).rejects.toThrow();
    await run("update", {
      ...base(id),
      changes: { note: "Keep hidden links" },
    });
    await run("person", { ...base(id), userId, selected: true });
    await run("person", { ...base(id), userId, selected: false });
    expect(
      await client.db
        .select()
        .from(calendarPeople)
        .where(eq(calendarPeople.itemId, id)),
    ).toHaveLength(1);
    // A different account joining does not inherit the old label.
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId: outsider,
      role: "member",
      sortKey: 0,
    });
    expect((await get(id))?.people).toEqual([]);
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId: other,
      role: "member",
      sortKey: 0,
    });
    expect((await get(id))?.people.map((p) => p.userId)).toEqual([other]);
  });
  it("rejects nonmembers as labels without changing the item", async () => {
    const id = await create();
    await expect(
      run("person", { ...base(id), userId: outsider, selected: true }),
    ).rejects.toThrow();
    expect((await get(id))?.people).toEqual([]);
  });
  it("bounds month reads while allowing historical and future detail reads", async () => {
    const past = await create("2020-02-29");
    const future = await create("2030-12-31");
    await create("2026-10-31");
    const november = await create("2026-11-30");
    await create("2026-12-01");
    expect((await month()).map((r) => r.id)).toEqual([november]);
    expect(await get(past)).toMatchObject({ day: "2020-02-29" });
    expect(await get(future)).toMatchObject({ day: "2030-12-31" });
  });
  it("moves to the destination end and preserves labels and notes", async () => {
    const a = await create();
    const b = await create("2026-11-12");
    const c = await create("2026-11-12");
    await run("person", { ...base(a), userId: other, selected: true });
    await run("update", { ...base(a), changes: { day: "2026-11-12" } });
    expect((await month()).map((r) => r.id)).toEqual([b, c, a]);
    expect(await get(a)).toMatchObject({
      note: "First line\nSecond line",
      people: [{ userId: other }],
    });
    await run("reorder", {
      ...base(a),
      day: "2026-11-12",
      orderedIds: [a, b, c],
    });
    expect((await month()).map((r) => r.id)).toEqual([a, b, c]);
    await expect(
      run("reorder", { ...base(a), day: "2026-11-11", orderedIds: [a] }),
    ).rejects.toThrow();
  });
  it("serializes concurrent appends and preserves unseen additions in stale reorders", async () => {
    const a = await create();
    const b = await create();
    const ids = Array.from({ length: 8 }, () => randomUUID());
    await Promise.all(
      ids.map((id) =>
        run("create", {
          ...base(id),
          title: "Concurrent",
          day: "2026-11-11",
          note: "",
        }),
      ),
    );
    const before = await month();
    expect(new Set(before.map((r) => r.sortKey)).size).toBe(before.length);
    await run("reorder", { ...base(b), day: "2026-11-11", orderedIds: [b, a] });
    const after = await month();
    expect(after.map((r) => r.id).slice(0, 2)).toEqual([b, a]);
    expect(new Set(after.map((r) => r.id))).toEqual(
      new Set(before.map((r) => r.id)),
    );
  });
  it("rejects cross-household writes, labels and ordering scopes", async () => {
    const id = await create();
    const foreign = randomUUID();
    await expect(
      run("update", {
        ...base(id),
        householdId: foreign,
        changes: { note: "Forged" },
      }),
    ).rejects.toThrow();
    await expect(
      run("reorder", {
        ...base(id),
        day: "2026-11-11",
        orderedIds: [id, randomUUID()],
      }),
    ).rejects.toThrow();
    expect(await get(id)).toMatchObject({ note: "First line\nSecond line" });
  });
  it("tombstones deletion and never revives it through a stale write or reused ID", async () => {
    const id = await create();
    await run("delete", base(id), other);
    expect(await get(id)).toBeUndefined();
    await expect(
      run("update", { ...base(id), changes: { title: "Stale" } }),
    ).rejects.toThrow();
    await expect(
      run("person", { ...base(id), userId, selected: true }),
    ).rejects.toThrow();
    await expect(
      run("create", {
        ...base(id),
        title: "Reused",
        day: "2026-11-11",
        note: "",
      }),
    ).rejects.toThrow();
    expect(await month()).toEqual([]);
  });
  it("revokes reads/writes on disable or household deletion without removing data", async () => {
    const id = await create();
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(eq(householdModuleSettings.householdId, householdId));
    expect(await month()).toEqual([]);
    await expect(
      run("update", { ...base(id), changes: { title: "Disabled" } }),
    ).rejects.toThrow();
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: true })
      .where(eq(householdModuleSettings.householdId, householdId));
    expect(await get(id)).toMatchObject({ title: "Dinner" });
    await client.db
      .update(households)
      .set({ deletedAt: new Date() })
      .where(eq(households.id, householdId));
    expect(await month()).toEqual([]);
    await expect(run("delete", base(id))).rejects.toThrow();
    expect(
      await client.db
        .select()
        .from(calendarItems)
        .where(eq(calendarItems.id, id)),
    ).toHaveLength(1);
  });
  it("enforces database bounds, real dates and household-qualified foreign keys", async () => {
    const id = await create();
    for (const day of ["2026-02-30", "2026-13-01", "2026-1-01"]) {
      await expect(
        client.db
          .update(calendarItems)
          .set({ day })
          .where(eq(calendarItems.id, id)),
      ).rejects.toThrow();
    }
    await expect(
      client.db
        .update(calendarItems)
        .set({ title: " " })
        .where(eq(calendarItems.id, id)),
    ).rejects.toThrow();
    await expect(
      client.db
        .update(calendarItems)
        .set({ note: "x".repeat(10001) })
        .where(eq(calendarItems.id, id)),
    ).rejects.toThrow();
    await expect(
      client.db
        .insert(calendarPeople)
        .values({ householdId: randomUUID(), itemId: id, userId }),
    ).rejects.toThrow();
    const publication = await client.db.execute(
      sql`select tablename from pg_publication_tables where pubname='home_hub_zero' and tablename in ('calendar_items','calendar_people')`,
    );
    expect(publication.rows).toHaveLength(2);
  });
});
