import { expect, it } from "vitest";
import { catalogPage, reorderNeighborhood } from "./catalog-page";

const entries = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));

it("bounds initial mounting without evicting focused or draft rows", () => {
  const page = catalogPage(entries, 50, "599", "598");
  expect(page).toHaveLength(52);
  expect(page.slice(0, 50)).toEqual(entries.slice(0, 50));
  expect(page.at(-1)?.id).toBe("599");
});

it("shows subsequent batches and retains existing row identities", () => {
  expect(catalogPage(entries, 100)[0]).toBe(entries[0]);
  expect(catalogPage(entries, 600)).toEqual(entries);
});

it("bounds sparse ordering to immediate neighbors for every target", () => {
  const ids = entries.map((e) => e.id);
  expect(reorderNeighborhood(ids, "300")).toEqual(["299", "300", "301"]);
  expect(reorderNeighborhood(ids, "0")).toEqual(["0", "1"]);
  expect(reorderNeighborhood(ids, "599")).toEqual(["598", "599"]);
  expect(reorderNeighborhood(ids, "absent")).toEqual([]);
});
