import { describe, expect, it } from "vitest";
import {
  addListItemMutationSchema,
  createListMutationSchema,
  listItemStatusSchema,
  listNameSchema,
  reorderListItemsMutationSchema,
  reorderListsMutationSchema,
} from "./lists";
import { normalizeListItemName, normalizeListName } from "./normalization";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const listId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const optimisticUpdatedAt = 1000;

describe("Lists contracts", () => {
  it("cleans names and normalizes Unicode, whitespace, and case", () => {
    expect(listNameSchema.parse("  Ｓhopping\n List ")).toBe("Shopping List");
    expect(normalizeListName(" ＳHOPPING  List ")).toBe("shopping list");
    expect(normalizeListItemName(" ＭILK\t Whole ")).toBe("milk whole");
  });
  it.each(["", "  \n ", "a".repeat(101)])("rejects invalid name %j", (name) => {
    expect(listNameSchema.safeParse(name).success).toBe(false);
  });
  it("requires the household/list identity and disallows supplied sort keys", () => {
    const args = {
      householdId,
      listId,
      name: "Shopping",
      optimisticTimestamp: 1000,
    };
    expect(createListMutationSchema.safeParse(args).success).toBe(true);
    expect(
      createListMutationSchema.safeParse({ ...args, sortKey: 1 }).success,
    ).toBe(false);
    expect(
      addListItemMutationSchema.safeParse({
        ...args,
        listId: undefined,
        itemId,
      }).success,
    ).toBe(false);
  });
  it.each(["active", "crossed", "archived"])(
    "preserves %s item status",
    (status) => {
      expect(listItemStatusSchema.parse(status)).toBe(status);
    },
  );
  it("requires unique ordered IDs including the moved list", () => {
    const args = {
      householdId,
      listId,
      optimisticUpdatedAt,
      orderedListIds: [listId],
    };
    expect(reorderListsMutationSchema.safeParse(args).success).toBe(true);
    for (const orderedListIds of [
      [],
      [itemId],
      [listId, listId],
      Array(501).fill(listId),
    ]) {
      expect(
        reorderListsMutationSchema.safeParse({ ...args, orderedListIds })
          .success,
      ).toBe(false);
    }
  });
  it("requires unique ordered item IDs, moved item, list, and valid status", () => {
    const args = {
      householdId,
      listId,
      itemId,
      optimisticUpdatedAt,
      status: "active",
      orderedItemIds: [itemId],
    };
    expect(reorderListItemsMutationSchema.safeParse(args).success).toBe(true);
    for (const patch of [
      { listId: undefined },
      { status: "deleted" },
      { orderedItemIds: [listId] },
      { orderedItemIds: [itemId, itemId] },
    ]) {
      expect(
        reorderListItemsMutationSchema.safeParse({ ...args, ...patch }).success,
      ).toBe(false);
    }
  });
});
