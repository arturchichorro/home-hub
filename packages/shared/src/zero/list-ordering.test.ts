import { describe, expect, it } from "vitest";
import { nextListSortKey, planListReorder } from "./list-ordering";

describe("Lists ordering", () => {
  const rows = [
    { id: "a", sortKey: 3072 },
    { id: "b", sortKey: 2048 },
    { id: "c", sortKey: 1024 },
  ];
  it("puts new entries at the top", () => {
    expect(nextListSortKey()).toBe(1024);
    expect(nextListSortKey(3072)).toBe(4096);
    expect(() => nextListSortKey(2147483647)).toThrow("rebalancing");
  });
  it.each([
    { order: ["c", "a", "b"], moved: "c", key: 4096 },
    { order: ["a", "c", "b"], moved: "c", key: 2560 },
    { order: ["b", "c", "a"], moved: "a", key: 0 },
  ])(
    "only updates the moved row when a gap exists: $order",
    ({ order, moved, key }) => {
      expect(planListReorder(rows, order, moved)).toEqual([
        { id: moved, sortKey: key },
      ]);
    },
  );
  it("handles a single row", () => {
    expect(planListReorder([{ id: "a", sortKey: 3072 }], ["a"], "a")).toEqual([
      { id: "a", sortKey: 0 },
    ]);
  });
  it("rejects any out-of-scope ID, even one that is not a neighbor", () => {
    expect(() =>
      planListReorder(rows, ["c", "a", "b", "foreign"], "c"),
    ).toThrow("not allowed");
  });
  it("rebalances exhausted gaps while retaining omitted concurrent rows", () => {
    const current = [
      { id: "new", sortKey: 12 },
      { id: "a", sortKey: 11 },
      { id: "b", sortKey: 10 },
      { id: "c", sortKey: 1 },
    ];
    expect(planListReorder(current, ["a", "c", "b"], "c")).toEqual([
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
      expect(
        planListReorder(current, ordered, "b").map((row) => row.id),
      ).toEqual(ordered);
    },
  );
});
