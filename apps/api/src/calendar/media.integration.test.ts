import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  calendarItems,
  calendarMedia,
  householdMembers,
  householdModuleSettings,
  households,
  media,
  users,
} from "@home-hub/database/schema";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq } from "drizzle-orm";
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
import { createCalendarMediaServices } from "./media";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))("calendar media on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let userId: string;
  let householdId: string;
  let itemId: string;
  let foreignHouseholdId: string;
  let foreignItemId: string;
  const signUpload = vi.fn(async () => "https://upload.example/object");
  const inspectObject = vi.fn(async () => ({
    contentType: "image/png",
    byteSize: 42,
  }));
  const processImage = vi.fn(async () => undefined);
  const signRead = vi.fn(async () => "https://images.example/authorized");
  const services = () =>
    createCalendarMediaServices({
      db: client.db,
      signUpload,
      inspectObject,
      processImage,
      signRead,
    });
  const scope = () => ({ userId, householdId, itemId });
  const upload = () =>
    services().createUpload({
      ...scope(),
      contentType: "image/png",
      byteSize: 42,
      width: 640,
      height: 480,
    });
  beforeAll(() => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.startsWith("/home_hub_test_")
    ) {
      throw new Error("Disposable home_hub_test_ database required");
    }

    client = createDbClient(databaseUrl);
  });
  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    signUpload.mockResolvedValue("https://upload.example/object");
    inspectObject.mockResolvedValue({
      contentType: "image/png",
      byteSize: 42,
    });
    signRead.mockResolvedValue("https://images.example/authorized");
    userId = randomUUID();
    householdId = randomUUID();
    itemId = randomUUID();
    foreignHouseholdId = randomUUID();
    foreignItemId = randomUUID();
    await client.db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      username: userId,
      passwordHash: "test-only",
    });
    await client.db.insert(households).values([
      { id: householdId, name: "Calendar media" },
      { id: foreignHouseholdId, name: "Other household" },
    ]);
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "owner",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "calendar", enabled: true });
    await client.db.insert(calendarItems).values([
      {
        id: itemId,
        householdId,
        day: "2026-11-12",
        title: "Dinner",
        note: "Keep my note",
        sortKey: 0,
      },
      {
        id: foreignItemId,
        householdId: foreignHouseholdId,
        day: "2026-11-12",
        title: "Foreign",
        sortKey: 0,
      },
    ]);
  });
  async function pending() {
    const result = await upload();

    if (result.kind !== "success") {
      throw new Error("Upload denied");
    }

    return result;
  }

  const read = (attachmentId: string, targetCalendarId = itemId) =>
    services().readUrls({
      userId,
      householdId,
      requests: [
        { itemId: targetCalendarId, attachmentId, variant: "thumbnail" },
      ],
    });

  it("creates distinct asset/attachment identities and confirms a reusable Calendar capability", async () => {
    const result = await pending();
    const [attachment] = await client.db
      .select()
      .from(calendarMedia)
      .where(eq(calendarMedia.id, result.attachmentId));

    if (!attachment) {
      throw new Error("Missing attachment");
    }

    expect(attachment.mediaId).not.toBe(result.attachmentId);
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toMatchObject({
      kind: "success",
      attachment: { id: result.attachmentId },
    });

    const [asset] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, attachment.mediaId));
    expect(asset).toMatchObject({
      kind: "image",
      animated: false,
      objectKey: `households/${householdId}/media/${attachment.mediaId}`,
    });
    expect(processImage).toHaveBeenCalledWith({
      identity: {
        householdId,
        mediaId: attachment.mediaId,
        storageRecipeId: null,
        moduleKey: "calendar",
        parentId: itemId,
        attachmentId: result.attachmentId,
      },
      contentType: "image/png",
      byteSize: 42,
    });
    expect(await read(result.attachmentId)).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: result.attachmentId, itemId }],
    });
    expect(signRead).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          moduleKey: "calendar",
          parentId: itemId,
          attachmentId: result.attachmentId,
        }),
      }),
    );
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });
    expect(inspectObject).toHaveBeenCalledOnce();
    expect(processImage).toHaveBeenCalledOnce();
  });
  it("serializes concurrent uploads and rolls back both records if signing fails", async () => {
    const results = await Promise.all([upload(), upload()]);
    expect(results.every((r) => r.kind === "success")).toBe(true);

    const rows = await client.db
      .select()
      .from(calendarMedia)
      .where(eq(calendarMedia.itemId, itemId));
    expect(rows.map((r) => r.sortKey).sort((a, b) => b - a)).toEqual([
      0, -1024,
    ]);
    signUpload.mockRejectedValueOnce(new Error("Signing unavailable"));
    await expect(upload()).rejects.toThrow();
    expect(
      await client.db
        .select()
        .from(calendarMedia)
        .where(eq(calendarMedia.itemId, itemId)),
    ).toHaveLength(2);
    expect(
      await client.db
        .select()
        .from(media)
        .where(eq(media.householdId, householdId)),
    ).toHaveLength(2);
  });
  it("omits foreign/mismatched attachments and deduplicates authorized batch requests", async () => {
    const result = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });

    const requests = [
      {
        itemId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        itemId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        itemId: foreignItemId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        itemId,
        attachmentId: randomUUID(),
        variant: "thumbnail" as const,
      },
    ];
    const batch = await services().readUrls({
      userId,
      householdId,
      requests,
    });
    expect(batch).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: result.attachmentId, itemId }],
    });

    if (batch.kind === "success") {
      expect(batch.reads).toHaveLength(1);
    }

    expect(signRead).toHaveBeenCalledOnce();
    expect(
      await services().confirmUpload({
        ...scope(),
        itemId: foreignItemId,
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "not_found" });
  });
  it("soft-deletes only the attachment, preserves shared bytes and prevents reconfirmation", async () => {
    const result = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });

    const [attachment] = await client.db
      .select()
      .from(calendarMedia)
      .where(eq(calendarMedia.id, result.attachmentId));

    if (!attachment) {
      throw new Error("Missing attachment");
    }

    const otherId = randomUUID();
    await client.db.insert(calendarMedia).values({
      id: otherId,
      householdId,
      itemId,
      mediaId: attachment.mediaId,
      sortKey: -1024,
    });
    expect(
      await services().deleteAttachment({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "success" });
    expect(
      await services().deleteAttachment({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "success" });
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
    expect(await read(otherId)).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: otherId }],
    });

    const [asset] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, attachment.mediaId));
    expect(asset?.deletedAt).toBeNull();
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "not_found" });
  });
  it("rejects unsupported bytes, unavailable objects and processing failures without confirmation", async () => {
    const result = await pending();
    processImage.mockRejectedValueOnce(new InvalidMediaUploadError());
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    inspectObject.mockResolvedValueOnce({
      contentType: "image/png",
      byteSize: 43,
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    processImage.mockRejectedValueOnce(new Error("Worker unavailable"));
    await expect(
      services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).rejects.toThrow();
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
  });
  it("enforces household-scoped asset and item foreign keys", async () => {
    const result = await pending();
    const [attachment] = await client.db
      .select()
      .from(calendarMedia)
      .where(eq(calendarMedia.id, result.attachmentId));

    if (!attachment) {
      throw new Error("Missing attachment");
    }

    for (const target of [
      { householdId, itemId: foreignItemId },
      { householdId: foreignHouseholdId, itemId: foreignItemId },
    ]) {
      await expect(
        client.db.insert(calendarMedia).values({
          id: randomUUID(),
          ...target,
          mediaId: attachment.mediaId,
          sortKey: 0,
        }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
    }
  });
  it("reauthorizes after processing before confirming when membership is revoked", async () => {
    const result = await pending();
    processImage.mockImplementationOnce(async () => {
      await client.db
        .delete(householdMembers)
        .where(eq(householdMembers.householdId, householdId));
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "forbidden" });

    const rows = await client.db
      .select()
      .from(media)
      .where(eq(media.householdId, householdId));
    expect(rows.every((r) => r.confirmedAt === null)).toBe(true);
  });
  it("fails closed for deleted items, disabled modules and foreign households", async () => {
    await client.db
      .update(calendarItems)
      .set({ deletedAt: new Date() })
      .where(eq(calendarItems.id, itemId));
    expect(await upload()).toEqual({ kind: "not_found" });
    await client.db
      .update(calendarItems)
      .set({ deletedAt: null })
      .where(eq(calendarItems.id, itemId));
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(
        and(
          eq(householdModuleSettings.householdId, householdId),
          eq(householdModuleSettings.moduleKey, "calendar"),
        ),
      );
    expect(await upload()).toEqual({ kind: "forbidden" });
    expect(
      await services().readUrls({
        userId,
        householdId: foreignHouseholdId,
        requests: [
          {
            itemId: foreignItemId,
            attachmentId: randomUUID(),
            variant: "thumbnail",
          },
        ],
      }),
    ).toEqual({ kind: "forbidden" });
    expect(signRead).not.toHaveBeenCalled();
    expect(signUpload).not.toHaveBeenCalled();
  });

  const synced = (actor = userId) =>
    createZeroDbProvider({ db: client.db }).run(
      queries.calendar.media.fn({
        ctx: { userId: actor },
        args: { householdId, itemId },
      }),
    );

  it("syncs only confirmed attachments and preserves photos and fields through date moves", async () => {
    const first = await pending();
    await pending();
    expect(await synced()).toEqual([]);
    await services().confirmUpload({
      ...scope(),
      attachmentId: first.attachmentId,
    });
    const before = await synced();
    expect(before.map((row) => row.id)).toEqual([first.attachmentId]);
    expect(JSON.stringify(before)).not.toContain("objectKey");
    const provider = createZeroDbProvider({ db: client.db });
    await provider.transaction((tx) =>
      mutators.calendar.update.fn({
        tx,
        ctx: { userId },
        args: {
          householdId,
          itemId,
          optimisticTimestamp: 1,
          changes: { day: "2027-01-10" },
        },
      }),
    );
    expect(await synced()).toEqual(before);
    expect(
      await client.db
        .select({
          title: calendarItems.title,
          note: calendarItems.note,
          day: calendarItems.day,
        })
        .from(calendarItems)
        .where(eq(calendarItems.id, itemId)),
    ).toEqual([{ title: "Dinner", note: "Keep my note", day: "2027-01-10" }]);
    await provider.transaction((tx) =>
      mutators.calendar.delete.fn({
        tx,
        ctx: { userId },
        args: { householdId, itemId, optimisticTimestamp: 1 },
      }),
    );
    expect(await synced()).toEqual([]);
    expect(await read(first.attachmentId)).toMatchObject({
      kind: "success",
      reads: [],
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: first.attachmentId,
      }),
    ).toEqual({ kind: "not_found" });
    expect(
      await client.db
        .select()
        .from(calendarMedia)
        .where(eq(calendarMedia.itemId, itemId)),
    ).toHaveLength(2);
  });

  it("shares pictures with current members only and hides them on module disablement", async () => {
    const first = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: first.attachmentId,
    });
    const member = randomUUID();
    await client.db.insert(users).values({
      id: member,
      email: `${member}@example.invalid`,
      username: member,
      passwordHash: "fixture",
    });
    expect(await synced(member)).toEqual([]);
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId: member,
      role: "member",
      sortKey: 0,
    });
    expect(await synced(member)).toHaveLength(1);
    expect(
      await services().deleteAttachment({
        ...scope(),
        userId: member,
        attachmentId: first.attachmentId,
      }),
    ).toEqual({ kind: "success" });
    expect(await synced()).toEqual([]);
    const second = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: second.attachmentId,
    });
    await client.db
      .delete(householdMembers)
      .where(eq(householdMembers.userId, member));
    expect(await synced(member)).toEqual([]);
    expect(
      await services().readUrls({
        userId: member,
        householdId,
        requests: [
          { itemId, attachmentId: second.attachmentId, variant: "thumbnail" },
        ],
      }),
    ).toEqual({ kind: "forbidden" });
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(
        and(
          eq(householdModuleSettings.householdId, householdId),
          eq(householdModuleSettings.moduleKey, "calendar"),
        ),
      );
    expect(await synced()).toEqual([]);
    expect(await read(second.attachmentId)).toEqual({ kind: "forbidden" });
  });

  it.each(["delete", "disable"])(
    "reauthorizes after processing if the parent is %s",
    async (change) => {
      const first = await pending();
      processImage.mockImplementationOnce(async () => {
        if (change === "delete") {
          await client.db
            .update(calendarItems)
            .set({ deletedAt: new Date() })
            .where(eq(calendarItems.id, itemId));
        } else {
          await client.db
            .update(householdModuleSettings)
            .set({ enabled: false })
            .where(
              and(
                eq(householdModuleSettings.householdId, householdId),
                eq(householdModuleSettings.moduleKey, "calendar"),
              ),
            );
        }
      });
      expect(
        await services().confirmUpload({
          ...scope(),
          attachmentId: first.attachmentId,
        }),
      ).toEqual({ kind: change === "delete" ? "not_found" : "forbidden" });
      expect(await synced()).toEqual([]);
    },
  );
});
