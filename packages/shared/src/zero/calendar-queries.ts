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
  habitChoices: define(
    calendarItemQuerySchema.pick({ householdId: true }),
    ({ args, ctx }) =>
      zql.habits
        .where("householdId", args.householdId)
        .where("status", "active")
        .whereExists("household", (h) =>
          h
            .where("deletedAt", "IS", null)
            .whereExists("members", (m) => m.where("userId", ctx.userId))
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "calendar").where("enabled", true),
            )
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "habits").where("enabled", true),
            ),
        )
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc"),
  ),
  habitAttachment: define(calendarItemQuerySchema, ({ args, ctx }) =>
    zql.calendarHabitAttachments
      .where("householdId", args.householdId)
      .where("itemId", args.itemId)
      .where("userId", ctx.userId)
      .whereExists("item", (i) =>
        i.where("deletedAt", "IS", null).whereExists("household", (h) =>
          h
            .where("deletedAt", "IS", null)
            .whereExists("members", (m) => m.where("userId", ctx.userId))
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "calendar").where("enabled", true),
            ),
        ),
      )
      .related("habit", (h) =>
        h.whereExists("household", (hh) =>
          hh.whereExists("moduleSettings", (s) =>
            s.where("moduleKey", "habits").where("enabled", true),
          ),
        ),
      )
      .one(),
  ),
  media: define(calendarItemQuerySchema, ({ args, ctx }) =>
    zql.calendarMedia
      .where("householdId", args.householdId)
      .where("itemId", args.itemId)
      .where("deletedAt", "IS", null)
      .whereExists("item", (i) =>
        i.where("deletedAt", "IS", null).whereExists("household", (h) =>
          h
            .where("deletedAt", "IS", null)
            .whereExists("members", (m) => m.where("userId", ctx.userId))
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "calendar").where("enabled", true),
            ),
        ),
      )
      .whereExists("asset", (a) =>
        a
          .where("kind", "image")
          .where("deletedAt", "IS", null)
          .where("confirmedAt", "IS NOT", null),
      )
      .related("asset")
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
  ),
  month: define(calendarRangeSchema, ({ args, ctx }) =>
    people(
      active(args.householdId, ctx.userId)
        .where("day", "<=", args.endOn)
        .where(({ and, or, cmp }) =>
          or(
            cmp("endDay", ">=", args.startOn),
            and(cmp("endDay", "IS", null), cmp("day", ">=", args.startOn)),
          ),
        ),
    )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
  ),
  item: define(calendarItemQuerySchema, ({ args, ctx }) =>
    people(active(args.householdId, ctx.userId).where("id", args.itemId)).one(),
  ),
};
