import type { AST } from "@rocicorp/zero";
import { expect, it } from "vitest";
import {
  createListMediaUploadSchema,
  listMediaPageSchema,
  reorderListMediaSchema,
} from "./list-media";
import { maxVideoByteSize } from "./media";
import { queries } from "./zero/queries";

const householdId = crypto.randomUUID(),
  listId = crypto.randomUUID(),
  userId = crypto.randomUUID();
it("accepts supported clips without relaxing still-image limits", () => {
  const metadata = {
    contentType: "video/mp4",
    byteSize: maxVideoByteSize,
    width: 1920,
    height: 1080,
  };
  expect(createListMediaUploadSchema.safeParse(metadata).success).toBe(true);
  for (const change of [
    { byteSize: maxVideoByteSize + 1 },
    { contentType: "image/jpeg" },
    { contentType: "video/quicktime" },
    { contentType: "image/gif" },
  ])
    expect(
      createListMediaUploadSchema.safeParse({ ...metadata, ...change }).success,
    ).toBe(false);
});
it("keeps old library readers free of new tables while bounding the moodboard mosaic", () => {
  const input = { args: { householdId }, ctx: { userId } };
  const legacy = (
    queries.lists.byHousehold.fn(input) as unknown as { ast: AST }
  ).ast;
  const modern = (queries.lists.library.fn(input) as unknown as { ast: AST })
    .ast;
  expect(legacy.related?.map((r) => r.subquery.table)).toEqual(["listItems"]);
  expect(
    modern.related?.find((r) => r.subquery.table === "listMedia")?.subquery
      .limit,
  ).toBe(4);
  expect(
    modern.related?.find((r) => r.subquery.table === "listItems")?.subquery
      .limit,
  ).toBe(4);
});
it("bounds reads and rejects ambiguous reorder neighborhoods", () => {
  expect(
    listMediaPageSchema.safeParse({ householdId, listId, limit: 0 }).success,
  ).toBe(false);
  expect(
    reorderListMediaSchema.safeParse({
      householdId,
      listId,
      attachmentId: listId,
      previousId: listId,
      nextId: null,
      optimisticTimestamp: 1,
    }).success,
  ).toBe(false);
});
it("authorizes board queries through a live moodboard, enabled Lists and current membership", () => {
  const text = JSON.stringify(
    (
      queries.lists.mediaPage.fn({
        args: { householdId, listId, limit: 51 },
        ctx: { userId },
      }) as unknown as { ast: AST }
    ).ast,
  );
  for (const value of [
    householdId,
    listId,
    userId,
    "moodboard",
    "householdMembers",
    "moduleKey",
    "lists",
    "confirmedAt",
    "deletedAt",
  ])
    expect(text).toContain(value);
});
