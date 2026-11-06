import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import { documentPageSchema, documentScopeSchema } from "../documents";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();

const household = (q: typeof zql.households, user: string) =>
  q
    .where("deletedAt", "IS", null)
    .whereExists("members", (m) => m.where("userId", user))
    .whereExists("moduleSettings", (s) =>
      s.where("moduleKey", "documents").where("enabled", true),
    );

const active = (id: string, user: string) =>
  zql.documents
    .where("householdId", id)
    .where("deletedAt", "IS", null)
    .whereExists("household", (h) => household(h, user));

const related = (q: ReturnType<typeof active>) =>
  q
    .related("file")
    .related("tags", (a) =>
      a
        .whereExists("tag", (t) => t.where("deletedAt", "IS", null))
        .related("tag"),
    );

export const documentQueries = {
  page: define(documentPageSchema, ({ args, ctx }) => {
    let q = active(args.householdId, ctx.userId);
    const search = args.search.trim();

    if (search) {
      const pattern = `%${search.replace(/[\\%_]/gu, (v) => `\\${v}`)}%`;
      q = q.where(({ or, cmp, exists }) =>
        or(
          cmp("title", "ILIKE", pattern),
          cmp("description", "ILIKE", pattern),
          exists("file", (f) => f.where("filename", "ILIKE", pattern)),
        ),
      );
    }

    for (const id of [...new Set(args.tagIds)]) {
      q = q.whereExists("tags", (a) =>
        a
          .where("tagId", id)
          .whereExists("tag", (t) => t.where("deletedAt", "IS", null)),
      );
    }

    if (args.untagged) {
      q = q.where(({ not, exists }) =>
        not(
          exists("tags", (a) =>
            a.whereExists("tag", (t) => t.where("deletedAt", "IS", null)),
          ),
        ),
      );
    }

    return related(q)
      .orderBy(args.sort, args.direction)
      .orderBy("id", "asc")
      .limit(args.limit);
  }),

  byId: define(documentScopeSchema, ({ args, ctx }) =>
    related(
      active(args.householdId, ctx.userId).where("id", args.documentId),
    ).one(),
  ),

  tags: define(z.object({ householdId: z.uuid() }).strict(), ({ args, ctx }) =>
    zql.documentTags
      .where("householdId", args.householdId)
      .where("deletedAt", "IS", null)
      .whereExists("household", (h) => household(h, ctx.userId))
      .orderBy("normalizedName", "asc")
      .orderBy("id", "asc"),
  ),
};
