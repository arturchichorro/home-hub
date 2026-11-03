import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  households,
  logEntries,
  logs,
  users,
} from "@home-hub/database/schema";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "../zero/db-provider";
import { createLogEntryServices } from "./entries";

const url = process.env.MEDIA_TEST_DATABASE_URL;
describe.runIf(!!url)("household logs on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>,
    userId: string,
    otherUser: string,
    householdId: string,
    foreign: string,
    logId: string;
  const now = () => new Date("2026-11-03T00:30:00Z"),
    service = () => createLogEntryServices({ db: client.db, now }),
    provider = () => createZeroDbProvider({ db: client.db });
  const scope = () => ({ userId, householdId, logId, entryOn: "2026-11-02" });
  const write = (
    input: Partial<Parameters<ReturnType<typeof service>["write"]>[0]> = {},
  ) =>
    service().write({
      ...scope(),
      entryId: randomUUID(),
      writeId: randomUUID(),
      expectedVersion: null,
      note: "First note",
      timeZone: "UTC",
      ...input,
    });
  const metadata = (
    fn: (
      tx: Parameters<
        Parameters<ReturnType<typeof provider>["transaction"]>[0]
      >[0],
    ) => Promise<unknown>,
  ) => provider().transaction(fn);
  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/media_migration_"))
      throw Error("Disposable database required");
    client = createDbClient(url);
  });
  afterAll(async () => {
    if (client) await client.close();
  });
  beforeEach(async () => {
    userId = randomUUID();
    otherUser = randomUUID();
    householdId = randomUUID();
    foreign = randomUUID();
    logId = randomUUID();
    await client.db.insert(users).values(
      [userId, otherUser].map((id) => ({
        id,
        email: `${id}@example.invalid`,
        username: id,
        passwordHash: "fixture",
      })),
    );
    await client.db.insert(households).values([
      { id: householdId, name: "Logs" },
      { id: foreign, name: "Other" },
    ]);
    await client.db.insert(householdMembers).values(
      [userId, otherUser].map((id) => ({
        id: randomUUID(),
        householdId,
        userId: id,
        role: "member" as const,
        sortKey: 0,
      })),
    );
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "logs", enabled: true });
    await client.db.insert(logs).values({
      id: logId,
      householdId,
      title: "Garden",
      normalizedTitle: "garden",
    });
  });
  it("stores one shared entry with author metadata and no private write IDs in sync", async () => {
    const { entry } = await write();
    expect(entry).toMatchObject({
      note: "First note",
      version: 1,
      createdBy: userId,
      lastEditedBy: userId,
    });
    expect(await service().read({ ...scope(), userId: otherUser })).toEqual({
      entry,
    });
    const synced = await provider().run(
      queries.logs.entry.fn({
        ctx: { userId: otherUser },
        args: { householdId, logId, entryOn: scope().entryOn },
      }),
    );
    expect(synced?.creator?.id).toBe(userId);
    expect(JSON.stringify(synced)).not.toContain("lastWriteId");
    expect(
      (await client.db.select().from(logs).where(eq(logs.id, logId)))[0]
        ?.lastEntryOn,
    ).toBe(scope().entryOn);
  });
  it("serializes two first writes so only one wins", async () => {
    const result = await Promise.allSettled([
      write(),
      write({ userId: otherUser, note: "Other" }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      await client.db
        .select()
        .from(logEntries)
        .where(eq(logEntries.logId, logId)),
    ).toHaveLength(1);
  });
  it("protects racing updates and returns the newer saved text", async () => {
    const base = (await write()).entry;
    if (!base) throw Error();
    const results = await Promise.allSettled([
      write({ entryId: base.id, expectedVersion: 1, note: "Member one" }),
      write({
        entryId: base.id,
        expectedVersion: 1,
        userId: otherUser,
        note: "Member two",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(
      failed?.status === "rejected" ? failed.reason : undefined,
    ).toMatchObject({ status: 409, entry: { version: 2 } });
    expect((await service().read(scope())).entry?.version).toBe(2);
  });
  it("retries the same operation idempotently without incrementing its revision", async () => {
    const entryId = randomUUID(),
      writeId = randomUUID(),
      first = await write({ entryId, writeId });
    expect(await write({ entryId, writeId })).toEqual(first);
    expect((await service().read(scope())).entry?.version).toBe(1);
  });
  it("soft-deletes on clearing, retains text and permits a new active entry on that date", async () => {
    const base = (await write()).entry;
    if (!base) throw Error();
    const writeId = randomUUID();
    expect(
      await write({ entryId: base.id, expectedVersion: 1, note: "", writeId }),
    ).toEqual({ entry: null });
    expect(
      await write({ entryId: base.id, expectedVersion: 1, note: "", writeId }),
    ).toEqual({ entry: null });
    const [retained] = await client.db
      .select()
      .from(logEntries)
      .where(eq(logEntries.id, base.id));
    expect(retained?.note).toBe("First note");
    expect(retained?.deletedAt).not.toBeNull();
    expect(
      (await client.db.select().from(logs).where(eq(logs.id, logId)))[0]
        ?.lastEntryOn,
    ).toBeNull();
    const next = (await write({ note: "Recreated" })).entry;
    expect(next?.id).not.toBe(base.id);
    await expect(
      write({
        entryId: base.id,
        writeId: randomUUID(),
        note: "Stale initial create",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not delete someone else's newer edit using an old revision", async () => {
    const base = (await write()).entry;
    if (!base) throw Error();
    await write({
      entryId: base.id,
      expectedVersion: 1,
      note: "Newer",
      userId: otherUser,
    });
    await expect(
      write({ entryId: base.id, expectedVersion: 1, note: "" }),
    ).rejects.toMatchObject({ status: 409, entry: { note: "Newer" } });
  });
  it("uses the writer's calendar only for new dates, while preserving shared edit access", async () => {
    await expect(
      write({ entryOn: "2026-11-03", timeZone: "America/Los_Angeles" }),
    ).rejects.toMatchObject({ status: 422 });
    const base = (
      await write({ entryOn: "2026-11-03", timeZone: "Pacific/Kiritimati" })
    ).entry;
    if (!base) throw Error();
    expect(
      (
        await write({
          entryOn: "2026-11-03",
          entryId: base.id,
          expectedVersion: 1,
          timeZone: "America/Los_Angeles",
          userId: otherUser,
          note: "Still Monday here",
        })
      ).entry?.entryOn,
    ).toBe("2026-11-03");
    await expect(
      write({ entryOn: "2026-11-04", timeZone: "Pacific/Kiritimati" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("blocks foreign households, missing membership, disabled modules and deleted logs", async () => {
    await write();
    await expect(
      service().read({ ...scope(), householdId: foreign }),
    ).rejects.toMatchObject({ status: 403 });
    await client.db
      .delete(householdMembers)
      .where(eq(householdMembers.userId, otherUser));
    await expect(write({ userId: otherUser })).rejects.toMatchObject({
      status: 403,
    });
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(eq(householdModuleSettings.householdId, householdId));
    expect(
      await provider().run(
        queries.logs.history.fn({
          ctx: { userId },
          args: { householdId, logId },
        }),
      ),
    ).toHaveLength(0);
    await expect(service().read(scope())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("keeps removed logs and entries but denies reads or writes and allows DB restoration", async () => {
    const saved = (await write()).entry;
    await metadata((tx) =>
      mutators.logs.delete.fn({
        tx,
        ctx: { userId },
        args: { householdId, logId },
      }),
    );
    await expect(service().read(scope())).rejects.toMatchObject({
      status: 404,
    });
    await expect(write()).rejects.toMatchObject({ status: 404 });
    expect(
      await client.db
        .select()
        .from(logEntries)
        .where(eq(logEntries.logId, logId)),
    ).toHaveLength(1);
    await client.db
      .update(logs)
      .set({ deletedAt: null })
      .where(eq(logs.id, logId));
    expect((await service().read(scope())).entry?.id).toBe(saved?.id);
  });
  it("enforces title/category uniqueness and household integrity without losing entries on rename/category removal", async () => {
    await write();
    const categoryId = randomUUID(),
      ctx = { userId };
    await metadata(async (tx) => {
      await mutators.logs.saveCategory.fn({
        tx,
        ctx,
        args: {
          householdId,
          categoryId,
          name: "House",
          color: "amber",
          optimisticTimestamp: 1,
        },
      });
      await mutators.logs.setCategory.fn({
        tx,
        ctx,
        args: { householdId, logId, categoryId, optimisticTimestamp: 1 },
      });
      await mutators.logs.rename.fn({
        tx,
        ctx,
        args: {
          householdId,
          logId,
          title: "Kitchen garden",
          optimisticTimestamp: 1,
        },
      });
    });
    expect((await service().read(scope())).entry?.note).toBe("First note");
    await expect(
      metadata((tx) =>
        mutators.logs.create.fn({
          tx,
          ctx,
          args: {
            householdId,
            logId: randomUUID(),
            title: " KITCHEN   GARDEN ",
            optimisticTimestamp: 1,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      client.db.insert(logs).values({
        id: randomUUID(),
        householdId: foreign,
        title: "Foreign",
        normalizedTitle: "foreign",
        categoryId,
      }),
    ).rejects.toThrow();
    await metadata((tx) =>
      mutators.logs.deleteCategory.fn({
        tx,
        ctx,
        args: { householdId, categoryId, optimisticTimestamp: 2 },
      }),
    );
    expect(
      (
        await provider().run(
          queries.logs.detail.fn({ ctx, args: { householdId, logId } }),
        )
      )?.category,
    ).toBeNull();
  });
  it("searches literal note text and pages exclusively by date", async () => {
    for (let i = 1; i <= 25; i++)
      await write({
        entryOn: `2026-10-${String(i).padStart(2, "0")}`,
        note: i === 1 ? "literal % needle" : "Daily update",
      });
    const page = await provider().run(
      queries.logs.history.fn({
        ctx: { userId },
        args: { householdId, logId },
      }),
    );
    expect(page).toHaveLength(21);
    const older = await provider().run(
      queries.logs.history.fn({
        ctx: { userId },
        args: { householdId, logId, before: page[19]?.entryOn },
      }),
    );
    expect(older).toHaveLength(5);
    expect(older.some((e) => e.id === page[19]?.id)).toBe(false);
    expect(
      await provider().run(
        queries.logs.history.fn({
          ctx: { userId },
          args: { householdId, logId, search: "%" },
        }),
      ),
    ).toHaveLength(1);
  });
});
