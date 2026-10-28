import { describe, expect, it } from "vitest";
import { catalogWindow, moveCatalogEntry } from "./catalog-window";

const entries = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));
describe("bounded catalog editors", () => {
  it("mounts at most 40 while retaining all 600 searchable records", () => {
    const page = catalogWindow(entries, 0, new Set());
    expect(page.entries).toEqual(entries.slice(0, 40));
    expect(page.pages).toBe(15);
    expect(entries).toHaveLength(600);
  });
  it("clamps after deletion or a filter shrinks the result", () => {
    expect(catalogWindow(entries.slice(0, 3), 14, new Set()).page).toBe(0);
    expect(catalogWindow([], 14, new Set())).toEqual({
      page: 0,
      pages: 1,
      entries: [],
    });
  });
  it("pins dirty/focused rows moved across boundaries by synchronization without exceeding 40", () => {
    const page = catalogWindow(entries, 1, new Set(["0", "599"]));
    expect(page.entries.map((e) => e.id)).toContain("0");
    expect(page.entries.map((e) => e.id)).toContain("599");
    expect(page.entries).toHaveLength(40);
  });
  it("can retain all 40 dirty editors when a concurrent reorder moves them off their original page", () => {
    const page = catalogWindow(
      entries,
      0,
      new Set(entries.slice(100, 140).map((e) => e.id)),
    );
    expect(page.entries).toEqual(entries.slice(100, 140));
  });
  it("moves across page boundaries without losing any unseen records", () => {
    const ids = entries.map((e) => e.id),
      moved = moveCatalogEntry(ids, "0", 40);
    expect(moved?.[40]).toBe("0");
    expect(new Set(moved).size).toBe(600);
    expect(ids[0]).toBe("0");
    expect(moveCatalogEntry(ids, "bad", 2)).toBeUndefined();
    expect(moveCatalogEntry(ids, "0", -1)).toBeUndefined();
    expect(moveCatalogEntry(ids, "0", 0)).toBeUndefined();
  });
});
