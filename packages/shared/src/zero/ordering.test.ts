import { describe, expect, it } from "vitest";
import { nextSortKey, planReorder } from "./ordering";

describe("Sort-key ordering", () => {
  const rows = [
    { id: "a", sortKey: 3072 },
    { id: "b", sortKey: 2048 },
    { id: "c", sortKey: 1024 },
  ];
  it("puts new entries at the top", () => {
    expect(nextSortKey()).toBe(1024);
    expect(nextSortKey(3072)).toBe(4096);
    expect(() => nextSortKey(2147483647)).toThrow("rebalancing");
  });
  it.each([
    { order: ["c", "a", "b"], moved: "c", key: 4096 },
    { order: ["a", "c", "b"], moved: "c", key: 2560 },
    { order: ["b", "c", "a"], moved: "a", key: 0 },
  ])(
    "only updates the moved row when a gap exists: $order",
    ({ order, moved, key }) => {
      expect(planReorder(rows, order, moved)).toEqual([
        { id: moved, sortKey: key },
      ]);
    },
  );
  it("handles a single row", () => {
    expect(planReorder([{ id: "a", sortKey: 3072 }], ["a"], "a")).toEqual([
      { id: "a", sortKey: 0 },
    ]);
  });
  it("rejects any out-of-scope ID, even one that is not a neighbor", () => {
    expect(() => planReorder(rows, ["c", "a", "b", "foreign"], "c")).toThrow(
      "not allowed",
    );
  });
  it("rebalances exhausted gaps while retaining omitted concurrent rows", () => {
    const current = [
      { id: "new", sortKey: 12 },
      { id: "a", sortKey: 11 },
      { id: "b", sortKey: 10 },
      { id: "c", sortKey: 1 },
    ];
    expect(planReorder(current, ["a", "c", "b"], "c")).toEqual([
      { id: "new", sortKey: 4096 },
      { id: "a", sortKey: 3072 },
      { id: "c", sortKey: 2048 },
      { id: "b", sortKey: 1024 },
    ]);
  });
  it.each([2147483647, -2147483648])(
    "rebalances at integer boundary %s",
    (boundary) => {
      const current = [
        { id: "a", sortKey: boundary },
        { id: "b", sortKey: 0 },
      ];
      const ordered = boundary > 0 ? ["b", "a"] : ["a", "b"];
      expect(planReorder(current, ordered, "b").map((row) => row.id)).toEqual(
        ordered,
      );
    },
  );
});
