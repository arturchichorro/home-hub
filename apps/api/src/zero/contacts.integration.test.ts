import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  contacts,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import {
  contactEntryResponseSchema,
  contactResponseSchema,
} from "@home-hub/shared/contacts";
import { queries } from "@home-hub/shared/zero/queries";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))("Contacts Zero mutations on PostgreSQL", () => {
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
        username: id,
        email: `${id}@example.invalid`,
        passwordHash: "fixture",
      })),
    );
    await client.db
      .insert(households)
      .values({ id: householdId, name: "Contacts Zero fixture" });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "member",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "contacts", enabled: true });
  });

  const run = (
    name: string,
    args: Parameters<typeof mutateWithHabitWorkouts>[3],
    actor = userId,
  ) =>
    createZeroDbProvider({ db: client.db }).transaction((tx) =>
      mutateWithHabitWorkouts(tx, actor, `contacts.${name}`, args),
    );

  const profile = () => ({
    householdId,
    contactId: randomUUID(),
    writeId: randomUUID(),
    expectedVersion: null,
    optimisticTimestamp: 1,
    fields: { name: "Alice", details: [], archived: false },
  });

  it("uses Zero's transaction and returns a confirmed snapshot; retries do not duplicate", async () => {
    const args = profile();
    const first = contactResponseSchema.parse(await run("profile", args));
    expect(first.record).toMatchObject({
      id: args.contactId,
      version: 1,
      fields: args.fields,
    });
    expect(await run("profile", args)).toEqual(first);
    const rows = await createZeroDbProvider({ db: client.db }).run(
      queries.contacts.index.fn({
        args: { householdId, search: "", archived: false, limit: 51 },
        ctx: { userId },
      }),
    );
    expect(rows.map((row) => row.id)).toEqual([args.contactId]);

    const cancelled = profile();
    await expect(
      createZeroDbProvider({ db: client.db }).transaction(async (tx) => {
        await mutateWithHabitWorkouts(
          tx,
          userId,
          "contacts.profile",
          cancelled,
        );
        throw Error("fixture rollback");
      }),
    ).rejects.toThrow("fixture rollback");
    expect(
      await client.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, cancelled.contactId)),
    ).toEqual([]);
  });

  it("returns structured conflicts without overwriting unseen edits or leaking records to outsiders", async () => {
    const args = profile();
    await run("profile", args);
    const edit = {
      ...args,
      expectedVersion: 1,
      writeId: randomUUID(),
      fields: { ...args.fields, name: "Remote edit" },
    };
    await run("profile", edit);
    await expect(
      run("profile", {
        ...edit,
        writeId: randomUUID(),
        fields: { ...args.fields, name: "Stale edit" },
      }),
    ).rejects.toMatchObject({
      details: {
        status: 409,
        record: { version: 2, fields: { name: "Remote edit" } },
      },
    });
    await expect(
      run("profile", { ...edit, expectedVersion: 2 }, outsider),
    ).rejects.toMatchObject({ details: { status: 403, record: null } });
  });

  it("synchronizes one shared entry, keeps image staging hidden from history and protects tombstones", async () => {
    const p = profile();
    await run("profile", p);
    const args = {
      householdId,
      entryId: randomUUID(),
      writeId: randomUUID(),
      expectedVersion: null,
      optimisticTimestamp: 1,
      timeZone: "UTC",
      action: "prepare-photo",
      fields: { entryOn: "2026-01-01", note: "", contactIds: [p.contactId] },
    };
    const staged = contactEntryResponseSchema.parse(
      await run("entry", args),
    ).record;
    expect(staged?.version).toBe(1);
    const provider = createZeroDbProvider({ db: client.db });
    expect(
      await provider.run(
        queries.contacts.history.fn({
          args: { householdId, contactId: p.contactId, search: "" },
          ctx: { userId },
        }),
      ),
    ).toEqual([]);
    expect(
      await provider.run(
        queries.contacts.entry.fn({
          args: { householdId, entryId: args.entryId },
          ctx: { userId },
        }),
      ),
    ).toMatchObject({ published: false });
    const saved = contactEntryResponseSchema.parse(
      await run("entry", {
        ...args,
        action: "save",
        expectedVersion: 1,
        writeId: randomUUID(),
        fields: { ...args.fields, note: "Shared note" },
      }),
    ).record;
    expect(saved?.version).toBe(2);
    expect(
      await provider.run(
        queries.contacts.history.fn({
          args: { householdId, contactId: p.contactId, search: "" },
          ctx: { userId },
        }),
      ),
    ).toHaveLength(1);
    expect(
      await run("entry", {
        ...args,
        action: "delete",
        expectedVersion: 2,
        writeId: randomUUID(),
      }),
    ).toEqual({ record: null });
    await expect(
      run("entry", {
        ...args,
        action: "save",
        expectedVersion: null,
        writeId: randomUUID(),
        fields: { ...args.fields, note: "Resurrection" },
      }),
    ).rejects.toMatchObject({ details: { status: 409, record: null } });
  });
});
