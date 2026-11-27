import { expect, it } from "vitest";
import { RetainedHistory } from "./use-retained-history";

it("drops empty history rows once no note draft needs them", () => {
  const history = new RetainedHistory<{ id: string; note: string }>();
  const rows = [
    { id: "empty", note: "" },
    { id: "kept", note: "Saved" },
  ];
  history.update(rows, new Set());
  expect(history.update(rows.slice(1), new Set())).toEqual([rows[1]]);
});

it("pins a removed query row until its note is saved or discarded", () => {
  const history = new RetainedHistory<{ id: string; note: string }>();
  const rows = [{ id: "editing", note: "" }];
  history.update(rows, new Set());
  history.update(rows, new Set(["editing"]));
  expect(history.update([], new Set(["editing"]))).toEqual(rows);
  expect(history.update([], new Set())).toEqual([]);
});

it("does not freeze an optimistic echo as the note's confirmed baseline after a failed save", () => {
  const history = new RetainedHistory<{ id: string; note: string }>();
  const baseline = [{ id: "editing", note: "" }];
  history.update(baseline, new Set());
  history.update(baseline, new Set(["editing"]));
  const echo = [{ id: "editing", note: "Unacknowledged draft" }];
  expect(history.update(echo, new Set(["editing"]))).toEqual(echo);
  expect(history.update([], new Set(["editing"]))).toEqual(baseline);
  expect(history.update(echo, new Set())).toEqual(echo);
});

it("retains only the current page and its dirty rows rather than accumulating history", () => {
  const history = new RetainedHistory<{ id: string }>();
  const old = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
  history.update(old, new Set());
  const current = [{ id: "new" }];
  expect(history.update(current, new Set(["3", "8"]))).toEqual([
    { id: "new" },
    { id: "3" },
    { id: "8" },
  ]);
  expect(history.update(current, new Set())).toEqual(current);
});
