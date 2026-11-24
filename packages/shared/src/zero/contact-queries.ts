import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import {
  contactIndexSchema,
  contactScopeSchema,
  entryHistorySchema,
  entryScopeSchema,
} from "../contacts";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();

const household = (q: typeof zql.households, userId: string) =>
  q
    .where("deletedAt", "IS", null)
    .whereExists("members", (m) => m.where("userId", userId))
    .whereExists("moduleSettings", (s) =>
      s.where("moduleKey", "contacts").where("enabled", true),
    );

const profiles = (householdId: string, userId: string) =>
  zql.contacts
    .where("householdId", householdId)
    .whereExists("household", (h) => household(h, userId));

const photos = (q: typeof zql.contactMedia) =>
  q
    .where("published", true)
    .where("deletedAt", "IS", null)
    .whereExists("asset", (a) =>
      a.where("deletedAt", "IS", null).where("confirmedAt", "IS NOT", null),
    )
    .related("asset")
    .orderBy("sortKey", "desc")
    .orderBy("id", "asc");

const entries = (householdId: string, userId: string) =>
  zql.contactEntries
    .where("householdId", householdId)
    .where("deletedAt", "IS", null)
    .where("published", true)
    .whereExists("household", (h) => household(h, userId));

const hydrated = (q: ReturnType<typeof entries>) =>
  q.related("people", (p) => p.related("contact")).related("media", photos);

const pattern = (s: string) =>
  "%" +
  s
    .trim()
    .normalize("NFKC")
    .replace(/[\\%_]/gu, (v) => "\\" + v) +
  "%";

export const contactQueries = {
  index: define(contactIndexSchema, ({ args, ctx }) => {
    let q = profiles(args.householdId, ctx.userId).where(
      "archived",
      args.archived,
    );
    if (args.search.trim()) {
      q = q.where("searchText", "ILIKE", pattern(args.search));
    }
    return q
      .related("media", photos)
      .orderBy("normalizedName", "asc")
      .orderBy("id", "asc")
      .limit(args.limit);
  }),
  detail: define(contactScopeSchema, ({ args, ctx }) =>
    profiles(args.householdId, ctx.userId)
      .where("id", args.contactId)
      .related("media", photos)
      .one(),
  ),
  entry: define(entryScopeSchema, ({ args, ctx }) =>
    hydrated(
      entries(args.householdId, ctx.userId).where("id", args.entryId),
    ).one(),
  ),
  history: define(entryHistorySchema, ({ args, ctx }) => {
    let q = entries(args.householdId, ctx.userId).whereExists("people", (p) =>
      p.where("contactId", args.contactId),
    );
    if (args.search.trim()) {
      q = q.where("note", "ILIKE", pattern(args.search));
    }
    if (args.through) {
      q = q.where("entryOn", "<=", args.through);
    }
    if (args.before) {
      const cursor = args.before;
      q = q.where(({ or, and, cmp }) =>
        or(
          cmp("entryOn", "<", cursor.entryOn),
          and(
            cmp("entryOn", "=", cursor.entryOn),
            cmp("createdAt", "<", cursor.createdAt),
          ),
          and(
            cmp("entryOn", "=", cursor.entryOn),
            cmp("createdAt", "=", cursor.createdAt),
            cmp("id", "<", cursor.id),
          ),
        ),
      );
    }
    return hydrated(q)
      .orderBy("entryOn", "desc")
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(21);
  }),
  media: define(
    z.object({
      householdId: z.uuid(),
      itemId: z.uuid(),
      kind: z.enum(["profile", "entry"]),
    }),
    ({ args, ctx }) => {
      let q = zql.contactMedia
        .where("householdId", args.householdId)
        .where("parentId", args.itemId);
      if (args.kind === "profile") {
        q = q.whereExists("contact", (p) =>
          p.whereExists("household", (h) => household(h, ctx.userId)),
        );
      } else {
        q = q.whereExists("entry", (e) =>
          e
            .where("deletedAt", "IS", null)
            .where("published", true)
            .whereExists("household", (h) => household(h, ctx.userId)),
        );
      }
      return photos(q);
    },
  ),
};
