import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  contactEntries,
  contactEntryPeople,
  contactMedia,
  householdMembers,
  householdModuleSettings,
  households,
  media,
  users,
} from "@home-hub/database/schema";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { InvalidMediaUploadError } from "../media/process-image";
import { createZeroDbProvider } from "../zero/db-provider";
import { createContactMediaServices } from "./media";
import { createContactsServices } from "./records";

const url = process.env.TEST_DATABASE_URL;
describe.runIf(Boolean(url))("Contacts on disposable PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let services: ReturnType<typeof createContactsServices>;
  let h: string;
  let user: string;
  let member: string;
  let outsider: string;
  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable database required");
    }
    client = createDbClient(url);
    services = createContactsServices({
      db: client.db,
      now: () => new Date("2026-11-24T12:00:00Z"),
    });
  });
  afterAll(async () => client?.close());
  beforeEach(async () => {
    h = randomUUID();
    user = randomUUID();
    member = randomUUID();
    outsider = randomUUID();
    await client.db.insert(users).values(
      [user, member, outsider].map((id) => ({
        id,
        username: id,
        email: id + "@example.invalid",
        passwordHash: "fixture",
      })),
    );
    await client.db
      .insert(households)
      .values({ id: h, name: "Contacts fixture" });
    await client.db.insert(householdMembers).values(
      [user, member].map((userId) => ({
        id: randomUUID(),
        householdId: h,
        userId,
        role: "member" as const,
        sortKey: 0,
      })),
    );
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId: h, moduleKey: "contacts", enabled: true });
  });
  const profile = (name = "Alice") =>
    services.writeProfile({
      householdId: h,
      userId: user,
      contactId: randomUUID(),
      expectedVersion: null,
      writeId: randomUUID(),
      fields: { name, details: [], archived: false },
    });
  const entry = (
    ids: string[],
    note = "Note",
    entryOn = "2026-11-24",
    action: "save" | "prepare-photo" = "save",
  ) =>
    services.writeEntry({
      householdId: h,
      userId: user,
      entryId: randomUUID(),
      expectedVersion: null,
      writeId: randomUUID(),
      fields: { entryOn, note, contactIds: [...ids].sort() },
      timeZone: "UTC",
      action,
    });
  const history = (
    contactId: string,
    actor = user,
    before?: { entryOn: string; createdAt: number; id: string },
  ) =>
    createZeroDbProvider({ db: client.db }).run(
      queries.contacts.history.fn({
        ctx: { userId: actor },
        args: { householdId: h, contactId, ...(before ? { before } : {}) },
      }),
    );
  const deps = () => ({
    db: client.db,
    signUpload: vi.fn(async () => "https://fixture.invalid/upload"),
    inspectObject: vi.fn(async () => ({
      contentType: "image/png",
      byteSize: 32,
    })),
    processImage: vi.fn(async () => {}),
    signRead: vi.fn(async () => "https://fixture.invalid/read"),
  });
  const photo = {
    contentType: "image/png" as const,
    byteSize: 32,
    width: 10,
    height: 10,
  };

  it("allows duplicate names and repeated detail labels without sharing identities", async () => {
    const a = await profile();
    const b = await profile();
    expect(a.id).not.toBe(b.id);
    const saved = await services.writeProfile({
      householdId: h,
      userId: member,
      contactId: a.id,
      expectedVersion: a.version,
      writeId: randomUUID(),
      fields: {
        ...a.fields,
        details: [1, 2].map(() => ({
          id: randomUUID(),
          type: "phone" as const,
          label: "Phone",
          value: "+32 123",
        })),
      },
    });
    expect(saved.fields.details).toHaveLength(2);
    expect(
      (
        await services.readProfile({
          householdId: h,
          userId: user,
          contactId: b.id,
        })
      )?.fields.details,
    ).toEqual([]);
  });

  it("shares one canonical entry across people and permits multiple entries per day", async () => {
    const a = await profile();
    const b = await profile("Bob");
    const first = await entry([a.id, b.id], "  First\n\nSecond  ");
    const second = await entry([a.id]);
    expect((await history(a.id)).map((r) => r.id)).toContain(first?.id);
    expect(await history(a.id)).toHaveLength(2);
    expect((await history(b.id))[0]?.id).toBe(first?.id);
    if (!first || !second) {
      throw Error("Missing entry");
    }
    const edited = await services.writeEntry({
      householdId: h,
      userId: member,
      entryId: first.id,
      expectedVersion: first.version,
      writeId: randomUUID(),
      fields: { ...first.fields, note: "Shared edit" },
      timeZone: "UTC",
      action: "save",
    });
    expect((await history(a.id)).find((r) => r.id === first.id)?.note).toBe(
      "Shared edit",
    );
    expect((await history(b.id))[0]?.version).toBe(edited?.version);
  });

  it("serializes concurrent edits and retries idempotently without overwriting unseen data", async () => {
    const p = await profile();
    const e = await entry([p.id]);
    if (!e) {
      throw Error();
    }
    const writeId = randomUUID();
    const input = {
      householdId: h,
      userId: user,
      entryId: e.id,
      expectedVersion: e.version,
      writeId,
      fields: { ...e.fields, note: "Winner" },
      timeZone: "UTC",
      action: "save" as const,
    };
    const results = await Promise.allSettled([
      services.writeEntry(input),
      services.writeEntry({
        ...input,
        userId: member,
        writeId: randomUUID(),
        fields: { ...e.fields, note: "Loser" },
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const latest = await services.readEntry({
      householdId: h,
      userId: user,
      entryId: e.id,
    });
    const retry = await services.writeEntry({
      ...input,
      fields: latest!.fields,
      writeId: results[0]?.status === "fulfilled" ? writeId : randomUUID(),
      expectedVersion:
        results[0]?.status === "fulfilled" ? e.version : latest!.version,
    });
    expect(retry?.fields.note).toBe(latest?.fields.note);
  });

  it("supports unlinking, retains other profiles and tombstones global deletion", async () => {
    const a = await profile();
    const b = await profile("Bob");
    const e = await entry([a.id, b.id]);
    if (!e) {
      throw Error();
    }
    const unlinked = await services.writeEntry({
      householdId: h,
      userId: user,
      entryId: e.id,
      expectedVersion: e.version,
      writeId: randomUUID(),
      fields: { ...e.fields, contactIds: [b.id] },
      timeZone: "UTC",
      action: "save",
    });
    expect(await history(a.id)).toEqual([]);
    expect(await history(b.id)).toHaveLength(1);
    if (!unlinked) {
      throw Error();
    }
    await services.writeEntry({
      householdId: h,
      userId: member,
      entryId: e.id,
      expectedVersion: unlinked.version,
      writeId: randomUUID(),
      fields: unlinked.fields,
      timeZone: "UTC",
      action: "delete",
    });
    expect(await history(b.id)).toEqual([]);
    await expect(
      services.writeEntry({
        householdId: h,
        userId: user,
        entryId: e.id,
        expectedVersion: null,
        writeId: randomUUID(),
        fields: e.fields,
        timeZone: "UTC",
        action: "save",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("retains archived links but forbids new links/entries and edits when all people are archived", async () => {
    const a = await profile();
    const b = await profile("Bob");
    const e = await entry([a.id, b.id]);
    if (!e) {
      throw Error();
    }
    const archived = await services.writeProfile({
      householdId: h,
      userId: user,
      contactId: a.id,
      expectedVersion: a.version,
      writeId: randomUUID(),
      fields: { ...a.fields, archived: true },
    });
    await expect(entry([a.id])).rejects.toMatchObject({ status: 422 });
    const edited = await services.writeEntry({
      householdId: h,
      userId: member,
      entryId: e.id,
      expectedVersion: e.version,
      writeId: randomUUID(),
      fields: { ...e.fields, note: "Still shared" },
      timeZone: "UTC",
      action: "save",
    });
    expect(await history(a.id)).toHaveLength(1);
    await services.writeProfile({
      householdId: h,
      userId: user,
      contactId: b.id,
      expectedVersion: b.version,
      writeId: randomUUID(),
      fields: { ...b.fields, archived: true },
    });
    await expect(
      services.writeEntry({
        householdId: h,
        userId: user,
        entryId: e.id,
        expectedVersion: edited!.version,
        writeId: randomUUID(),
        fields: e.fields,
        timeZone: "UTC",
        action: "save",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await services.writeProfile({
      householdId: h,
      userId: user,
      contactId: a.id,
      expectedVersion: archived.version,
      writeId: randomUUID(),
      fields: { ...archived.fields, archived: false },
    });
  });

  it("hides pending photo-only entries, publishes confirmed images and guards last-content removal", async () => {
    const p = await profile();
    const e = await entry([p.id], "", "2026-11-24", "prepare-photo");
    if (!e) {
      throw Error();
    }
    expect(await history(p.id)).toEqual([]);
    const updated = await services.writeEntry({
      householdId: h,
      userId: user,
      entryId: e.id,
      expectedVersion: e.version,
      writeId: randomUUID(),
      fields: { ...e.fields, entryOn: "2026-11-23" },
      timeZone: "UTC",
      action: "prepare-photo",
    });
    expect(updated?.fields.entryOn).toBe("2026-11-23");
    expect(await history(p.id)).toEqual([]);
    const dependencies = deps();
    const images = createContactMediaServices(dependencies, "entry");
    const scope = { userId: user, householdId: h, itemId: e.id };
    const pending = await images.createUpload({ ...scope, ...photo });
    dependencies.processImage.mockRejectedValueOnce(
      new InvalidMediaUploadError(),
    );
    expect(
      await images.confirmUpload({
        ...scope,
        attachmentId: pending.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    expect(await history(p.id)).toEqual([]);
    await images.confirmUpload({
      ...scope,
      attachmentId: pending.attachmentId,
    });
    expect(await history(p.id)).toHaveLength(1);
    await expect(
      images.deleteAttachment({ ...scope, attachmentId: pending.attachmentId }),
    ).rejects.toMatchObject({ status: 422 });
    const current = await services.readEntry({
      householdId: h,
      userId: user,
      entryId: e.id,
    });
    await services.writeEntry({
      householdId: h,
      userId: user,
      entryId: e.id,
      expectedVersion: current!.version,
      writeId: randomUUID(),
      fields: { ...e.fields, note: "Caption" },
      timeZone: "UTC",
      action: "save",
    });
    await images.deleteAttachment({
      ...scope,
      attachmentId: pending.attachmentId,
    });
    expect((await history(p.id))[0]?.note).toBe("Caption");
  });

  it("replaces a profile picture only after confirmation and preserves the old picture on failure", async () => {
    const p = await profile();
    const dependencies = deps();
    const images = createContactMediaServices(dependencies, "profile");
    const scope = { userId: user, householdId: h, itemId: p.id };
    const first = await images.createUpload({ ...scope, ...photo });
    await images.confirmUpload({ ...scope, attachmentId: first.attachmentId });
    const second = await images.createUpload({ ...scope, ...photo });
    dependencies.processImage.mockRejectedValueOnce(
      new InvalidMediaUploadError(),
    );
    expect(
      await images.confirmUpload({
        ...scope,
        attachmentId: second.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    expect(
      (
        await images.readUrls({
          ...scope,
          requests: [
            {
              itemId: p.id,
              attachmentId: first.attachmentId,
              variant: "thumbnail",
            },
          ],
        })
      ).reads,
    ).toHaveLength(1);
    await images.confirmUpload({ ...scope, attachmentId: second.attachmentId });
    expect(
      (
        await images.readUrls({
          ...scope,
          requests: [
            {
              itemId: p.id,
              attachmentId: first.attachmentId,
              variant: "thumbnail",
            },
          ],
        })
      ).reads,
    ).toEqual([]);
    const active = await client.db
      .select()
      .from(contactMedia)
      .where(
        and(eq(contactMedia.contactId, p.id), eq(contactMedia.published, true)),
      );
    expect(active).toHaveLength(1);
  });

  it("rechecks membership/module access after image processing and never confirms a revoked upload", async () => {
    const p = await profile();
    const dependencies = deps();
    const images = createContactMediaServices(dependencies, "profile");
    const scope = { userId: user, householdId: h, itemId: p.id };
    const pending = await images.createUpload({ ...scope, ...photo });
    dependencies.processImage.mockImplementationOnce(async () => {
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(eq(householdModuleSettings.householdId, h));
    });
    await expect(
      images.confirmUpload({ ...scope, attachmentId: pending.attachmentId }),
    ).rejects.toMatchObject({ status: 403 });
    const [attachment] = await client.db
      .select()
      .from(contactMedia)
      .where(eq(contactMedia.id, pending.attachmentId));
    expect(attachment?.published).toBe(false);
    const [asset] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, attachment!.mediaId));
    expect(asset?.confirmedAt).toBeNull();
  });

  it("denies outsider reads/writes/media and excludes hidden idempotency fields from publication", async () => {
    const p = await profile();
    expect(await history(p.id, outsider)).toEqual([]);
    await expect(
      services.readProfile({
        householdId: h,
        userId: outsider,
        contactId: p.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      services.writeProfile({
        householdId: h,
        userId: outsider,
        contactId: p.id,
        expectedVersion: p.version,
        writeId: randomUUID(),
        fields: p.fields,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createContactMediaServices(deps(), "profile").createUpload({
        householdId: h,
        userId: outsider,
        itemId: p.id,
        ...photo,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const result = await client.db.execute(
      sql`SELECT attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename IN ('contacts','contact_entries')`,
    );
    for (const row of result.rows) {
      expect(row.attnames).not.toContain("last_write_id");
      expect(row.attnames).not.toContain("last_write_hash");
    }
  });

  it("paginates same-day entries without gaps and rejects future dates and orphaning", async () => {
    const p = await profile();
    for (let i = 0; i < 24; i++) {
      await entry([p.id], "Entry " + i);
    }
    const first = await history(p.id);
    const cursor = first[19];
    if (!cursor) {
      throw Error();
    }
    const second = await history(p.id, user, {
      entryOn: cursor.entryOn,
      createdAt: cursor.createdAt ?? 0,
      id: cursor.id,
    });
    expect(
      new Set([...first.slice(0, 20), ...second].map((r) => r.id)).size,
    ).toBe(24);
    await expect(entry([p.id], "Future", "2026-11-25")).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      client.db
        .delete(contactEntryPeople)
        .where(eq(contactEntryPeople.entryId, cursor.id)),
    ).rejects.toThrow();
    expect(
      await client.db
        .select()
        .from(contactEntries)
        .where(eq(contactEntries.id, cursor.id)),
    ).toHaveLength(1);
  });
});
