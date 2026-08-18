import { describe, expect, it } from "vitest";
import { orderCurrentShoppingItems } from "./shopping-list-order";

describe("orderCurrentShoppingItems", () => {
  it("places active items before crossed items and excludes archived items", () => {
    const items = [
      { id: "crossed-first", status: "crossed" as const },
      { id: "active-first", status: "active" as const },
      { id: "archived", status: "archived" as const },
      { id: "active-second", status: "active" as const },
      { id: "crossed-second", status: "crossed" as const },
      { id: "invalid-null", status: null },
    ];

    expect(orderCurrentShoppingItems(items).map((item) => item.id)).toEqual([
      "active-first",
      "active-second",
      "crossed-first",
      "crossed-second",
    ]);
  });
});
