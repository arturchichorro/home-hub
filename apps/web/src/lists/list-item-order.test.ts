import { describe, expect, it } from "vitest";
import { orderCurrentListItems } from "./list-item-order";

describe("orderCurrentListItems", () => {
  it("orders active and crossed groups by descending sort key", () => {
    const items = [
      { id: "crossed-high", sortKey: 20, status: "crossed" as const },
      { id: "active-low", sortKey: 10, status: "active" as const },
      { id: "archived", sortKey: 50, status: "archived" as const },
      { id: "active-high", sortKey: 30, status: "active" as const },
      { id: "crossed-low", sortKey: 5, status: "crossed" as const },
      { id: "invalid-null", sortKey: 40, status: null },
    ];

    expect(orderCurrentListItems(items).map((item) => item.id)).toEqual([
      "active-high",
      "active-low",
      "crossed-high",
      "crossed-low",
    ]);
  });
});
