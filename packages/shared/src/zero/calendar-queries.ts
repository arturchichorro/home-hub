import { defineQueryWithType } from "@rocicorp/zero";
import { calendarItemQuerySchema, calendarRangeSchema } from "../calendar";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();
const active = (householdId: string, userId: string) =>
  zql.calendarItems
    .where("householdId", householdId)
    .where("deletedAt", "IS", null)
    .whereExists("household", (h) =>
      h
        .where("deletedAt", "IS", null)
        .whereExists("members", (m) => m.where("userId", userId))
        .whereExists("moduleSettings", (s) =>
          s.where("moduleKey", "calendar").where("enabled", true),
        ),
    );
const people = (q: ReturnType<typeof active>) =>
  q.related("people", (p) =>
    p.whereExists("member").related("member", (m) => m.related("user")),
  );

export const calendarQueries = {
  month: define(calendarRangeSchema, ({ args, ctx }) =>
    people(
      active(args.householdId, ctx.userId)
        .where("day", ">=", args.startOn)
        .where("day", "<=", args.endOn),
    )
      .orderBy("day", "asc")
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
  ),
  item: define(calendarItemQuerySchema, ({ args, ctx }) =>
    people(active(args.householdId, ctx.userId).where("id", args.itemId)).one(),
  ),
};
