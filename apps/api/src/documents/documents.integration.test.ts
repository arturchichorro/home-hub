import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  documentFiles,
  documents,
  documentTagAssignments,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createZeroDbProvider } from "../zero/db-provider";
import { createDocumentServices, type DocumentStorage } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(!!url)("documents on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let userId: string;
  let householdId: string;
  let foreignId: string;
  const bytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const objects = new Map<string, Uint8Array>();
  let storage: DocumentStorage;
  let service: ReturnType<typeof createDocumentServices>;
  const scope = () => ({ userId, householdId });
  const upload = (documentId?: string) =>
    service.createUpload({
      ...scope(),
      filename: "policy.pdf",
      byteSize: bytes.length,
      ...(documentId ? { documentId } : {}),
    });
  const provider = () => createZeroDbProvider({ db: client.db });
  const page = (args = {}) =>
    provider().run(
      queries.documents.page.fn({
        ctx: { userId },
        args: { householdId, ...args },
      }),
    );
  const mutate = (
    fn: (
      tx: Parameters<
        Parameters<ReturnType<typeof provider>["transaction"]>[0]
      >[0],
    ) => Promise<unknown>,
  ) => provider().transaction(fn);

  async function confirmed() {
    const u = await upload();
    await service.confirm({ ...scope(), fileId: u.fileId });

    return u;
  }

  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }

    client = createDbClient(url);
  });
  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });
  beforeEach(async () => {
    objects.clear();
    userId = randomUUID();
    householdId = randomUUID();
    foreignId = randomUUID();
    await client.db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      username: userId,
      passwordHash: "test-only",
    });
    await client.db.insert(households).values([
      { id: householdId, name: "Documents" },
      { id: foreignId, name: "Other" },
    ]);
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "member",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "documents", enabled: true });
    storage = {
      signUpload: vi.fn(async () => "https://upload.example/"),

      readUpload: vi.fn(async () => bytes),

      putVerified: vi.fn(async (key, data) => {
        objects.set(key, data);
      }),

      signRead: vi.fn(async () => "https://files.example/authorized"),
    };
    service = createDocumentServices({ db: client.db, storage });
  });
  it("publishes a row only after validation and retains immutable file context", async () => {
    const u = await upload();
    expect(await page()).toHaveLength(0);
    await service.confirm({ ...scope(), fileId: u.fileId });

    const rows = await page();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: u.documentId,
      title: "policy",
      file: { filename: "policy.pdf", contentType: "application/pdf" },
    });
    expect(JSON.stringify(rows)).not.toMatch(
      /objectKey|verified|expectedFileId/u,
    );
    expect(objects.size).toBe(1);
    expect(
      (
        await service.read({
          ...scope(),
          documentId: u.documentId,
          disposition: "inline",
        })
      ).url,
    ).toContain("authorized");
    await service.confirm({ ...scope(), fileId: u.fileId });
    expect(await page()).toHaveLength(1);
  });
  it("keeps metadata, tags and row identity when replacing, retaining old bytes", async () => {
    const first = await confirmed();
    const tagId = randomUUID();
    const ctx = { userId };
    await mutate(async (tx) => {
      await mutators.documents.update.fn({
        tx,
        ctx,
        args: {
          householdId,
          documentId: first.documentId,
          field: "title",
          value: "Home policy",
          optimisticTimestamp: 1,
        },
      });
      await mutators.documents.saveTag.fn({
        tx,
        ctx,
        args: {
          householdId,
          tagId,
          name: "House",
          color: "green",
          optimisticTimestamp: 1,
        },
      });
      await mutators.documents.assignTag.fn({
        tx,
        ctx,
        args: {
          householdId,
          documentId: first.documentId,
          tagId,
          assigned: true,
        },
      });
    });

    const before = (await page())[0];
    const next = await upload(first.documentId);
    expect((await page())[0]?.fileId).toBe(first.fileId);
    await service.confirm({ ...scope(), fileId: next.fileId });

    const after = (await page())[0];
    expect(after).toMatchObject({
      id: first.documentId,
      title: "Home policy",
      fileId: next.fileId,
      createdAt: before?.createdAt,
      tags: [{ tagId }],
    });
    expect(after?.uploadedAt).toBeGreaterThanOrEqual(before?.uploadedAt ?? 0);
    expect(
      await client.db
        .select()
        .from(documentFiles)
        .where(eq(documentFiles.documentId, first.documentId)),
    ).toHaveLength(2);
    expect(objects.size).toBe(2);
  });
  it("only one concurrent replacement wins; stale retry cannot roll it back", async () => {
    const first = await confirmed();
    const a = await upload(first.documentId);
    const b = await upload(first.documentId);
    const results = await Promise.allSettled([
      service.confirm({ ...scope(), fileId: a.fileId }),
      service.confirm({ ...scope(), fileId: b.fileId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const current = (await page())[0]?.fileId;
    await service.confirm({ ...scope(), fileId: first.fileId });
    expect((await page())[0]?.fileId).toBe(current);
  });
  it("rechecks access after processing and never confirms a revoked upload", async () => {
    const u = await upload();
    storage.putVerified = vi.fn(async () => {
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(eq(householdModuleSettings.householdId, householdId));
    });
    await expect(
      service.confirm({ ...scope(), fileId: u.fileId }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await client.db
        .select()
        .from(documents)
        .where(eq(documents.id, u.documentId)),
    ).toHaveLength(0);
  });
  it("rejects foreign households, removed membership, deleted households and disabled modules", async () => {
    const u = await confirmed();
    expect(
      await provider().run(
        queries.documents.page.fn({
          ctx: { userId },
          args: { householdId: foreignId },
        }),
      ),
    ).toHaveLength(0);
    await expect(
      service.createUpload({
        ...scope(),
        householdId: foreignId,
        filename: "a.pdf",
        byteSize: bytes.length,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await client.db
      .update(households)
      .set({ deletedAt: new Date() })
      .where(eq(households.id, householdId));
    expect(await page()).toHaveLength(0);
    await expect(
      service.read({
        ...scope(),
        documentId: u.documentId,
        disposition: "inline",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps the old current file after invalid replacement", async () => {
    const first = await confirmed();
    const next = await upload(first.documentId);
    storage.readUpload = vi.fn(async () => new Uint8Array(bytes.length));
    await expect(
      service.confirm({ ...scope(), fileId: next.fileId }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await page())[0]?.fileId).toBe(first.fileId);
  });
  it("soft removal hides rows and denies new reads without deleting files or permitting resurrection", async () => {
    const u = await confirmed();
    await mutate((tx) =>
      mutators.documents.delete.fn({
        tx,
        ctx: { userId },
        args: { householdId, documentId: u.documentId },
      }),
    );
    expect(await page()).toHaveLength(0);
    await expect(
      service.read({
        ...scope(),
        documentId: u.documentId,
        disposition: "inline",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.confirm({ ...scope(), fileId: u.fileId }),
    ).rejects.toMatchObject({ status: 404 });
    expect(objects.size).toBe(1);
  });
  it("searches filenames/title/description and intersects tags, excluding deleted tags", async () => {
    const a = await confirmed();
    const b = await confirmed();
    const ctx = { userId };
    const t1 = randomUUID();
    const t2 = randomUUID();
    await mutate(async (tx) => {
      for (const [tagId, name] of [
        [t1, "House"],
        [t2, "Insurance"],
      ] as const) {
        await mutators.documents.saveTag.fn({
          tx,
          ctx,
          args: {
            householdId,
            tagId,
            name,
            color: "blue",
            optimisticTimestamp: 1,
          },
        });
      }

      for (const [documentId, tagId] of [
        [a.documentId, t1],
        [a.documentId, t2],
        [b.documentId, t1],
      ] as const) {
        await mutators.documents.assignTag.fn({
          tx,
          ctx,
          args: { householdId, documentId, tagId, assigned: true },
        });
      }
    });
    expect(await page({ tagIds: [t1, t2] })).toHaveLength(1);
    expect(await page({ search: "POLICY.PDF" })).toHaveLength(2);
    expect(await page({ search: "%" })).toHaveLength(0);
    await mutate((tx) =>
      mutators.documents.deleteTag.fn({
        tx,
        ctx,
        args: { householdId, tagId: t2, optimisticTimestamp: 2 },
      }),
    );
    expect(
      (await page()).flatMap((r) => r.tags).some((a) => a.tagId === t2),
    ).toBe(false);
    expect(await page({ tagIds: [t2] })).toHaveLength(0);
  });
  it("normalizes duplicate tags, preserves IDs on rename and enforces household FKs", async () => {
    const u = await confirmed();
    const ctx = { userId };
    const tagId = randomUUID();
    await mutate((tx) =>
      mutators.documents.saveTag.fn({
        tx,
        ctx,
        args: {
          householdId,
          tagId,
          name: "House",
          color: "green",
          optimisticTimestamp: 1,
        },
      }),
    );
    await expect(
      mutate((tx) =>
        mutators.documents.saveTag.fn({
          tx,
          ctx,
          args: {
            householdId,
            tagId: randomUUID(),
            name: " HOUSE ",
            color: "red",
            optimisticTimestamp: 1,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      client.db
        .insert(documentTagAssignments)
        .values({ householdId: foreignId, documentId: u.documentId, tagId }),
    ).rejects.toThrow();
    await expect(
      client.db.execute(
        sql`UPDATE documents SET household_id=${foreignId} WHERE id=${u.documentId}`,
      ),
    ).rejects.toThrow();
  });
});
