import { expect, it } from "vitest";
import { httpOperation } from "./http-operations";

it.each([
  ["GET", "/api/households/:householdId/habits/:habitId/stats", "habits.stats"],
  [
    "GET",
    "/api/households/:householdId/workouts/exercises/:exerciseId/stats",
    "workouts.stats",
  ],
  [
    "POST",
    "/api/households/:householdId/calendar/items/:itemId/media/uploads",
    "calendar.media_upload",
  ],
  [
    "POST",
    "/api/households/:householdId/calendar/items/:itemId/media/:attachmentId/confirm",
    "calendar.media_confirm",
  ],
  [
    "POST",
    "/api/households/:householdId/calendar/items/media/read-urls",
    "calendar.media_read",
  ],
  [
    "DELETE",
    "/api/households/:householdId/calendar/items/:itemId/media/:attachmentId",
    "calendar.media_remove",
  ],
])(
  "classifies current %s %s without recording entity values",
  (method, route, expected) => {
    expect(httpOperation(method, route)).toBe(expected);
  },
);
