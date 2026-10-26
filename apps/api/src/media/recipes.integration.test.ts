import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  households,
  media,
  recipeCookLogs,
  recipeMedia,
  recipes,
  users,
} from "@home-hub/database/schema";
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
import { createConfirmRecipeImageUploadService } from "../recipes/images/confirm-upload";
import { createRecipeImageReadUrlService } from "../recipes/images/create-read-url";
import { createRecipeImageReadUrlsService } from "../recipes/images/create-read-urls";
import { createRecipeImageUploadService } from "../recipes/images/create-upload";
import { createDeleteRecipeImageService } from "../recipes/images/delete";
import { InvalidMediaUploadError } from "./process-image";

// Opt-in only, against databases created/discarded by verify-media-migration.sh.
const databaseUrl = process.env.MEDIA_TEST_DATABASE_URL;
describe.runIf(Boolean(databaseUrl))("recipe media on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let userId: string;
  let householdId: string;
  let recipeId: string;
  let otherRecipeId: string;
  beforeAll(() => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.startsWith("/media_migration_")
    )
      throw new Error("Disposable media migration database required");
    client = createDbClient(databaseUrl);
  });
  afterAll(async () => {
    if (client) await client.close();
  });
  beforeEach(async () => {
    userId = randomUUID();
    householdId = randomUUID();
    recipeId = randomUUID();
    otherRecipeId = randomUUID();
    await client.db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      username: userId,
      passwordHash: "test-only",
    });
    await client.db
      .insert(households)
      .values({ id: householdId, name: "Media test" });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "owner",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "recipes", enabled: true });
    await client.db.insert(recipes).values(
      [recipeId, otherRecipeId].map((id) => ({
        id,
        householdId,
        title: "Media test recipe",
        sortKey: 0,
      })),
    );
  });
  function command(imageId: string, parentId = recipeId) {
    return { userId, householdId, recipeId: parentId, imageId };
  }
  async function asset(confirmedAt: Date | null = new Date()) {
    const id = randomUUID();
    const objectKey = `households/${householdId}/recipes/${recipeId}/${id}`;
    await client.db.insert(media).values({
      id,
      householdId,
      kind: "image",
      objectKey,
      contentType: "image/png",
      byteSize: 42,
      width: 800,
      height: 600,
      confirmedAt,
    });
    const attachmentId = randomUUID();
    await client.db.insert(recipeMedia).values({
      id: attachmentId,
      householdId,
      recipeId,
      mediaId: id,
      sortKey: 0,
    });
    return { id, objectKey, attachmentId };
  }

  it("atomically creates and confirms an asset while preserving recipe route contracts", async () => {
    const signUpload = vi.fn(async () => "https://upload.example");
    const upload = await createRecipeImageUploadService({
      db: client.db,
      signUpload,
    })({
      userId,
      householdId,
      recipeId,
      cookLogId: null,
      contentType: "image/png",
      byteSize: 42,
      width: 800,
      height: 600,
    });
    expect(upload.kind).toBe("success");
    if (upload.kind !== "success") throw new Error("Upload failed");
    const [row] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, upload.imageId));
    expect(row).toMatchObject({
      objectKey: `households/${householdId}/media/${upload.imageId}`,
      kind: "image",
      confirmedAt: null,
      animated: null,
    });
    const inspectObject = vi.fn(async () => ({
      contentType: "image/png",
      byteSize: 42,
    }));
    const processDerivatives = vi.fn(async () => undefined);
    const confirm = createConfirmRecipeImageUploadService({
      db: client.db,
      inspectObject,
      processDerivatives,
    });
    const result = await confirm(command(upload.imageId));
    expect(result).toMatchObject({
      kind: "success",
      image: { id: upload.imageId },
    });
    expect(await confirm(command(upload.imageId))).toEqual(result);
    expect(inspectObject).toHaveBeenCalledOnce();
    expect(processDerivatives).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: upload.imageId,
        objectKey: row?.objectKey,
      }),
    );
    const [confirmed] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, upload.imageId));
    expect(confirmed?.animated).toBe(false);
    expect(confirmed?.confirmedAt).toBeInstanceOf(Date);
    const failed = vi.fn(async () => {
      throw new Error("Signing failed");
    });
    await expect(
      createRecipeImageUploadService({ db: client.db, signUpload: failed })({
        userId,
        householdId,
        recipeId,
        cookLogId: null,
        contentType: "image/png",
        byteSize: 42,
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow();
    expect(
      await client.db
        .select()
        .from(media)
        .where(eq(media.householdId, householdId)),
    ).toHaveLength(1);
    expect(
      await client.db
        .select()
        .from(recipeMedia)
        .where(eq(recipeMedia.householdId, householdId)),
    ).toHaveLength(1);
  });

  it("authorizes a reused legacy asset by current attachment, not storage recipe", async () => {
    const image = await asset();
    const attachmentId = randomUUID();
    await client.db.insert(recipeMedia).values({
      id: attachmentId,
      householdId,
      recipeId: otherRecipeId,
      mediaId: image.id,
      sortKey: 0,
    });
    await client.db
      .update(recipes)
      .set({ deletedAt: new Date() })
      .where(eq(recipes.id, recipeId));
    const signRead = vi.fn(async () => "https://images.example/signed");
    const read = createRecipeImageReadUrlService({ db: client.db, signRead });
    expect(
      await read({
        ...command(attachmentId, otherRecipeId),
        variant: "viewer",
      }),
    ).toMatchObject({ kind: "success" });
    expect(signRead).toHaveBeenCalledWith({
      householdId,
      imageId: attachmentId,
      recipeId: otherRecipeId,
      mediaId: image.id,
      objectKey: image.objectKey,
      variant: "viewer",
    });
    expect(
      await read({ ...command(image.attachmentId), variant: "viewer" }),
    ).toEqual({ kind: "not_found" });
    const batch = await createRecipeImageReadUrlsService({
      db: client.db,
      signRead,
    })({
      userId,
      householdId,
      requests: [
        {
          imageId: attachmentId,
          recipeId: otherRecipeId,
          variant: "thumbnail",
        },
        { imageId: attachmentId, recipeId, variant: "thumbnail" },
        { imageId: image.attachmentId, recipeId, variant: "thumbnail" },
      ],
    });
    expect(batch).toMatchObject({
      kind: "success",
      reads: [{ imageId: attachmentId, recipeId: otherRecipeId }],
    });
    if (batch.kind === "success") expect(batch.reads).toHaveLength(1);
  });

  it("unlinks only the selected attachment and keeps deleted-log photos readable", async () => {
    const image = await asset();
    const attachmentId = randomUUID();
    const logId = randomUUID();
    await client.db.insert(recipeCookLogs).values({
      id: logId,
      householdId,
      recipeId: otherRecipeId,
      cookedAt: new Date(),
    });
    await client.db.insert(recipeMedia).values({
      id: attachmentId,
      householdId,
      recipeId: otherRecipeId,
      mediaId: image.id,
      cookLogId: logId,
      sortKey: 0,
    });
    const unlink = createDeleteRecipeImageService({ db: client.db });
    expect(await unlink(command(image.attachmentId))).toEqual({
      kind: "success",
    });
    expect(await unlink(command(image.attachmentId))).toEqual({
      kind: "success",
    });
    const [row] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, image.id));
    expect(row?.deletedAt).toBeNull();
    await client.db
      .update(recipeCookLogs)
      .set({ deletedAt: new Date() })
      .where(eq(recipeCookLogs.id, logId));
    const signRead = vi.fn(async () => "https://images.example/signed");
    const read = createRecipeImageReadUrlService({ db: client.db, signRead });
    expect(
      await read({
        ...command(attachmentId, otherRecipeId),
        variant: "thumbnail",
      }),
    ).toMatchObject({ kind: "success" });
    expect(
      await read({ ...command(image.attachmentId), variant: "thumbnail" }),
    ).toEqual({ kind: "not_found" });
  });

  it("fails closed on unsupported uploads, pending assets and revoked access", async () => {
    const image = await asset(null);
    const inspectObject = vi.fn(async () => ({
      contentType: "image/png",
      byteSize: 42,
    }));
    const confirm = createConfirmRecipeImageUploadService({
      db: client.db,
      inspectObject,
      processDerivatives: async () => {
        throw new InvalidMediaUploadError();
      },
    });
    expect(await confirm(command(image.attachmentId))).toEqual({
      kind: "invalid_upload",
    });
    const [row] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, image.id));
    expect(row?.confirmedAt).toBeNull();
    const signRead = vi.fn(async () => "https://images.example/signed");
    const read = createRecipeImageReadUrlService({ db: client.db, signRead });
    expect(
      await read({ ...command(image.attachmentId), variant: "thumbnail" }),
    ).toEqual({ kind: "not_found" });
    await client.db
      .update(media)
      .set({ confirmedAt: new Date() })
      .where(eq(media.id, image.id));
    expect(await read({ ...command(image.id), variant: "thumbnail" })).toEqual({
      kind: "not_found",
    }); // asset ID is not an attachment ID
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(
        and(
          eq(householdModuleSettings.householdId, householdId),
          eq(householdModuleSettings.moduleKey, "recipes"),
        ),
      );
    expect(
      await read({ ...command(image.attachmentId), variant: "thumbnail" }),
    ).toEqual({ kind: "forbidden" });
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: true })
      .where(eq(householdModuleSettings.householdId, householdId));
    await client.db
      .delete(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(
      await read({ ...command(image.attachmentId), variant: "thumbnail" }),
    ).toEqual({ kind: "forbidden" });
    expect(signRead).not.toHaveBeenCalled();
  });
});
