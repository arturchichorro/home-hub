import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import {
  logEntryScopeSchema,
  logHistorySchema,
  logIndexSchema,
  logScopeSchema,
} from "../logs";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();
const household = (q: typeof zql.households, userId: string) =>
  q
    .where("deletedAt", "IS", null)
    .whereExists("members", (m) => m.where("userId", userId))
    .whereExists("moduleSettings", (s) =>
      s.where("moduleKey", "logs").where("enabled", true),
    );
const activeLogs = (id: string, user: string) =>
  zql.logs
    .where("householdId", id)
    .where("deletedAt", "IS", null)
    .whereExists("household", (h) => household(h, user));
const entries = (h: string, l: string, u: string) =>
  zql.logEntries
    .where("householdId", h)
    .where("logId", l)
    .where("deletedAt", "IS", null)
    .whereExists("log", (q) =>
      q
        .where("deletedAt", "IS", null)
        .whereExists("household", (h) => household(h, u)),
    );
const people = (q: ReturnType<typeof entries>) =>
  q.related("creator").related("editor");
const escapeSearch = (s: string) =>
  `%${s.trim().replace(/[\\%_]/gu, (v) => `\\${v}`)}%`;
export const logQueries = {
  index: define(logIndexSchema, ({ args, ctx }) => {
    let q = activeLogs(args.householdId, ctx.userId);
    if (args.search.trim()) {
      const pattern = escapeSearch(args.search);
      q = q.where(({ or, cmp, exists }) =>
        or(
          cmp("title", "ILIKE", pattern),
          exists("category", (c) =>
            c.where("deletedAt", "IS", null).where("name", "ILIKE", pattern),
          ),
        ),
      );
    }
    return q
      .related("category", (c) => c.where("deletedAt", "IS", null))
      .orderBy("normalizedTitle", "asc")
      .orderBy("id", "asc")
      .limit(args.limit);
  }),
  detail: define(logScopeSchema, ({ args, ctx }) =>
    activeLogs(args.householdId, ctx.userId)
      .where("id", args.logId)
      .related("category", (c) => c.where("deletedAt", "IS", null))
      .one(),
  ),
  categories: define(
    z.object({ householdId: z.uuid() }).strict(),
    ({ args, ctx }) =>
      zql.logCategories
        .where("householdId", args.householdId)
        .where("deletedAt", "IS", null)
        .whereExists("household", (h) => household(h, ctx.userId))
        .orderBy("normalizedName", "asc")
        .orderBy("id", "asc"),
  ),
  history: define(logHistorySchema, ({ args, ctx }) => {
    let q = entries(args.householdId, args.logId, ctx.userId);
    if (args.before) q = q.where("entryOn", "<", args.before);
    if (args.search.trim())
      q = q.where("note", "ILIKE", escapeSearch(args.search));
    return people(q).orderBy("entryOn", "desc").limit(21);
  }),
  entry: define(logEntryScopeSchema, ({ args, ctx }) =>
    people(
      entries(args.householdId, args.logId, ctx.userId).where(
        "entryOn",
        args.entryOn,
      ),
    ).one(),
  ),
};
