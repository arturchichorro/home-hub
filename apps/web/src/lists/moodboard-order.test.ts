import { expect, it } from "vitest";
import { applyMoodboardOrder, moveMoodboardPin } from "./moodboard-order";

it("moves one pin in either direction without losing the other IDs", () => {
  const order = ["a", "b", "c", "d"];

  expect(moveMoodboardPin(order, "a", "c")).toEqual(["b", "c", "a", "d"]);
  expect(moveMoodboardPin(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
  expect(order).toEqual(["a", "b", "c", "d"]);
});

it("ignores missing, removed and unchanged drag targets", () => {
  const order = ["a", "b", "c"];

  expect(moveMoodboardPin(order, "a", "a")).toBe(order);
  expect(moveMoodboardPin(order, "missing", "b")).toBe(order);
  expect(moveMoodboardPin(order, "a", "missing")).toBe(order);
});

it("uses current rows for previews, retaining uploads and fresh metadata but not deleted pins", () => {
  const updated = { id: "a", name: "Updated remotely" };
  const existing = { id: "c", name: "Current" };
  const uploaded = { id: "new", name: "Uploaded during drag" };
  const pins = [updated, existing, uploaded];
  const preview = applyMoodboardOrder(pins, ["removed", "c", "a", "a"]);

  expect(preview).toEqual([existing, updated, uploaded]);
  expect(preview[1]).toBe(updated);
  expect(applyMoodboardOrder(pins, undefined)).toBe(pins);
});

it("returns to authoritative query order when a drag or save is cancelled", () => {
  const pins = [{ id: "a" }, { id: "b" }, { id: "c" }];

  expect(applyMoodboardOrder(pins, ["c", "a", "b"])).toEqual([
    pins[2],
    pins[0],
    pins[1],
  ]);
  expect(applyMoodboardOrder(pins, undefined)).toEqual(pins);
});
