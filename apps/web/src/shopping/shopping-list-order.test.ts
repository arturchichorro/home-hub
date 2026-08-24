import { describe, expect, it } from "vitest";
import { orderCurrentShoppingItems } from "./shopping-list-order";

describe("orderCurrentShoppingItems", () => {
  it("places newest active items before newest crossed items and excludes archived items", () => {
    const items = [
      { createdAt: 20, id: "crossed-new", status: "crossed" as const },
      { createdAt: 10, id: "active-old", status: "active" as const },
      { createdAt: 50, id: "archived", status: "archived" as const },
      { createdAt: 30, id: "active-new", status: "active" as const },
      { createdAt: 5, id: "crossed-old", status: "crossed" as const },
      { createdAt: 40, id: "invalid-null", status: null },
    ];

    expect(orderCurrentShoppingItems(items).map((item) => item.id)).toEqual([
      "active-new",
      "active-old",
      "crossed-new",
      "crossed-old",
    ]);
  });
});
