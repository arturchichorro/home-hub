import type { Database, DatabaseTransaction } from "@home-hub/database";
import { describe, expect, it, vi } from "vitest";
import { authorizeModule } from "../../authorization/module-access";
import { findRecipeForShare } from "./scoped-entities";
import { createUploadRecipeImageContent } from "./upload-content";

vi.mock("../../authorization/module-access", () => ({
  authorizeModule: vi.fn(),
}));
vi.mock("./scoped-entities", () => ({ findRecipeForShare: vi.fn() }));

const input = {
  principal: {
    guest: {
      id: "link",
      householdId: "home",
      access: "write" as const,
      expiresAt: Date.now() + 10000,
    },
  },
  householdId: "home",
  recipeId: "recipe",
  imageId: "image",
  contentType: "image/webp",
  body: new Uint8Array([1, 2, 3]),
};
function setup(
  image: { objectKey: string; contentType: string; byteSize: number } | null = {
    objectKey: "private-original",
    contentType: "image/webp",
    byteSize: 3,
  },
) {
  vi.mocked(authorizeModule).mockResolvedValue(undefined);
  vi.mocked(findRecipeForShare).mockResolvedValue({ id: "recipe" });
  const lock = vi.fn(async () => (image ? [image] : []));
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    for: lock,
  };
  const tx = { select: () => builder } as unknown as DatabaseTransaction;
  let transactionOpen = false;
  const db = {
    transaction: async (
      work: (tx: DatabaseTransaction) => Promise<unknown>,
    ) => {
      transactionOpen = true;
      try {
        return await work(tx);
      } finally {
        transactionOpen = false;
      }
    },
  } as unknown as Database;
  const put = vi.fn(async () => {
    expect(transactionOpen).toBe(true);
  });
  return { upload: createUploadRecipeImageContent({ db, put }), put, lock, tx };
}
describe("authenticated image content upload", () => {
  it.each(["unauthorized", "forbidden"] as const)(
    "does not send bytes to storage when %s",
    async (denied) => {
      const { upload, put } = setup();
      vi.mocked(authorizeModule).mockResolvedValue(denied);
      expect(await upload(input)).toEqual({ kind: denied });
      expect(put).not.toHaveBeenCalled();
    },
  );
  it("requires an active recipe and pending image", async () => {
    const { upload, put } = setup(null);
    expect(await upload(input)).toEqual({ kind: "not_found" });
    vi.mocked(findRecipeForShare).mockResolvedValue(undefined);
    expect(await upload(input)).toEqual({ kind: "not_found" });
    expect(put).not.toHaveBeenCalled();
  });
  it.each([{ contentType: "image/png" }, { body: new Uint8Array([1]) }])(
    "rejects bytes that disagree with authorized metadata",
    async (change) => {
      const { upload, put } = setup();
      expect(await upload({ ...input, ...change })).toEqual({
        kind: "invalid",
      });
      expect(put).not.toHaveBeenCalled();
    },
  );
  it("keeps write authorization locked through storage upload", async () => {
    const { upload, put, lock, tx } = setup();
    expect(await upload(input)).toEqual({ kind: "success" });
    expect(authorizeModule).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        principal: input.principal,
        householdId: "home",
        moduleKey: "recipes",
        write: true,
      }),
    );
    expect(lock).toHaveBeenCalledWith("update");
    expect(put).toHaveBeenCalledWith({
      objectKey: "private-original",
      contentType: "image/webp",
      body: input.body,
    });
  });
});
