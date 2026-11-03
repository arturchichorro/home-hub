import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  households,
  listMedia,
  lists,
  media,
  users,
} from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createListMediaServices, type ListMediaDependencies } from "./media";

const url = process.env.MEDIA_TEST_DATABASE_URL;
describe.runIf(Boolean(url))("moodboard media on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>,
    userId: string,
    householdId: string,
    listId: string;
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
    householdId = randomUUID();
    listId = randomUUID();
    await client.db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      username: userId,
      passwordHash: "fixture",
    });
    await client.db
      .insert(households)
      .values({ id: householdId, name: "Moodboard fixture" });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "owner",
      sortKey: 1024,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "lists", enabled: true });
    await client.db.insert(lists).values({
      id: listId,
      householdId,
      name: "Board",
      normalizedName: "board",
      kind: "moodboard",
      sortKey: 1024,
    });
  });
  const scope = () => ({ userId, householdId, listId });
  function setup(contentType = "video/mp4") {
    const processVideo = vi.fn(async () => ({
      width: 400,
      height: 600,
      durationMs: 2000,
      videoVersion: "a".repeat(64),
    }));
    const processImage = vi.fn(async () => {}),
      inspectObject = vi.fn(async () => ({ contentType, byteSize: 1000 }));
    const signRead = vi.fn(async () => "https://fixture.invalid/poster"),
      signVideo = vi.fn<ListMediaDependencies["signVideo"]>(
        async () => "https://fixture.invalid/video",
      );
    const services = createListMediaServices({
      db: client.db,
      signUpload: async () => "https://fixture.invalid/upload",
      processVideo,
      processImage,
      inspectObject,
      signRead,
      signVideo,
    });
    const upload = () =>
      services.createUpload({
        ...scope(),
        contentType: contentType as "video/mp4" | "image/png",
        byteSize: 1000,
        width: 320,
        height: 240,
      });
    return {
      services,
      upload,
      processVideo,
      processImage,
      inspectObject,
      signRead,
      signVideo,
    };
  }
  async function id(
    result: Awaited<ReturnType<ReturnType<typeof setup>["upload"]>>,
  ) {
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw Error("fixture");
    return result.attachmentId;
  }
  const count = async () =>
    (await client.db.select().from(lists).where(eq(lists.id, listId)))[0]
      ?.mediaCount;
  it("confirms clips exactly once, publishes authoritative metadata and signed playback/poster reads", async () => {
    const f = setup(),
      attachmentId = await id(await f.upload());
    expect(await count()).toBe(0);
    expect(
      await f.services.readUrls({
        userId,
        householdId,
        requests: [{ listId, attachmentId, variant: "video" }],
      }),
    ).toMatchObject({ kind: "success", reads: [] });
    expect(
      (await f.services.confirmUpload({ ...scope(), attachmentId })).kind,
    ).toBe("success");
    expect(await count()).toBe(1);
    await f.services.confirmUpload({ ...scope(), attachmentId });
    expect(f.processVideo).toHaveBeenCalledOnce();
    expect(await count()).toBe(1);
    const read = await f.services.readUrls({
      userId,
      householdId,
      requests: [
        { listId, attachmentId, variant: "video" },
        { listId, attachmentId, variant: "thumbnail" },
      ],
    });
    expect(read).toMatchObject({
      kind: "success",
      reads: [{ variant: "video" }, { variant: "thumbnail" }],
    });
    expect(f.signVideo.mock.calls[0]?.[0]).toMatchObject({
      videoVersion: "a".repeat(64),
      identity: { moduleKey: "lists", parentId: listId, attachmentId },
    });
    const [asset] = await client.db
      .select()
      .from(media)
      .innerJoin(listMedia, eq(media.id, listMedia.mediaId))
      .where(eq(listMedia.id, attachmentId));
    expect(asset?.media).toMatchObject({
      kind: "video",
      width: 400,
      height: 600,
      durationMs: 2000,
      videoVersion: "a".repeat(64),
    });
  });
  it("keeps image processing separate and never signs an image as a video", async () => {
    const f = setup("image/png"),
      attachmentId = await id(await f.upload());
    await f.services.confirmUpload({ ...scope(), attachmentId });
    expect(f.processVideo).not.toHaveBeenCalled();
    expect(f.processImage).toHaveBeenCalledOnce();
    expect(await count()).toBe(1);
    expect(
      await f.services.readUrls({
        userId,
        householdId,
        requests: [{ listId, attachmentId, variant: "video" }],
      }),
    ).toMatchObject({ kind: "success", reads: [] });
  });
  it("retains assets on removal and serializes concurrent upload/count changes", async () => {
    const f = setup(),
      [a, b] = await Promise.all([f.upload(), f.upload()]),
      ids = [await id(a), await id(b)];
    await Promise.all(
      ids.map((attachmentId) =>
        f.services.confirmUpload({ ...scope(), attachmentId }),
      ),
    );
    expect(await count()).toBe(2);
    await Promise.all(
      ids.map((attachmentId) =>
        f.services.deleteAttachment({ ...scope(), attachmentId }),
      ),
    );
    expect(await count()).toBe(0);
    const attached = await client.db
      .select()
      .from(listMedia)
      .where(eq(listMedia.listId, listId));
    expect(attached.every((r) => r.deletedAt !== null)).toBe(true);
    for (const row of attached)
      expect(
        (
          await client.db.select().from(media).where(eq(media.id, row.mediaId))
        )[0]?.confirmedAt,
      ).not.toBeNull();
  });
  it("rejects checklist, disabled-module and foreign-parent access before storage calls", async () => {
    const f = setup();
    await client.db
      .update(lists)
      .set({ kind: "checklist" })
      .where(eq(lists.id, listId));
    expect((await f.upload()).kind).toBe("not_found");
    await client.db
      .update(lists)
      .set({ kind: "moodboard" })
      .where(eq(lists.id, listId));
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(eq(householdModuleSettings.householdId, householdId));
    expect((await f.upload()).kind).toBe("forbidden");
    expect(f.inspectObject).not.toHaveBeenCalled();
    expect(
      (
        await f.services.confirmUpload({
          ...scope(),
          householdId: randomUUID(),
          attachmentId: randomUUID(),
        })
      ).kind,
    ).toBe("forbidden");
  });
  it("reauthorizes after external processing without holding database locks", async () => {
    const f = setup(),
      attachmentId = await id(await f.upload());
    f.processVideo.mockImplementation(async () => {
      await client.db
        .update(lists)
        .set({ deletedAt: new Date() })
        .where(eq(lists.id, listId));
      return {
        width: 400,
        height: 600,
        durationMs: 2000,
        videoVersion: "b".repeat(64),
      };
    });
    expect(
      (await f.services.confirmUpload({ ...scope(), attachmentId })).kind,
    ).toBe("not_found");
    const [asset] = await client.db
      .select()
      .from(media)
      .innerJoin(listMedia, eq(media.id, listMedia.mediaId))
      .where(eq(listMedia.id, attachmentId));
    expect(asset?.media.confirmedAt).toBeNull();
  });
});
