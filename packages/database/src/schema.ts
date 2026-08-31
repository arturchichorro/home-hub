import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id").references(
      (): AnyPgColumn => refreshTokens.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("refresh_tokens_user_id_idx").on(table.userId)],
);

export const householdMemberRoleEnum = pgEnum("household_member_role", [
  "owner",
  "member",
]);

export const households = pgTable("households", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: householdMemberRoleEnum().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("household_members_household_id_user_id_idx").on(
      table.householdId,
      table.userId,
    ),
    uniqueIndex("household_members_one_owner_idx")
      .on(table.householdId)
      .where(sql`${table.role} = 'owner'`),
    index("household_members_user_id_idx").on(table.userId),
  ],
);

export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("household_invites_token_hash_idx").on(table.tokenHash),
    index("household_invites_household_id_idx").on(table.householdId),
  ],
);

export const householdsRelations = relations(households, ({ many }) => ({
  images: many(recipeImages),
  listItems: many(listItems),
  lists: many(lists),
  members: many(householdMembers),
  moduleSettings: many(householdModuleSettings),
  recipes: many(recipes),
}));

export const householdMembersRelations = relations(
  householdMembers,
  ({ one }) => ({
    household: one(households, {
      fields: [householdMembers.householdId],
      references: [households.id],
    }),
  }),
);

export const listItemStatusEnum = pgEnum("list_item_status", [
  "active",
  "crossed",
  "archived",
]);

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    sortKey: integer("sort_key").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("lists_household_id_id_unique").on(table.householdId, table.id),
    uniqueIndex("lists_household_id_normalized_name_idx")
      .on(table.householdId, table.normalizedName)
      .where(sql`${table.deletedAt} is null`),
    index("lists_household_id_sort_key_id_idx")
      .on(table.householdId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    listId: uuid("list_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: listItemStatusEnum().notNull().default("active"),
    sortKey: integer("sort_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.listId],
      foreignColumns: [lists.householdId, lists.id],
      name: "list_items_household_list_fk",
    }).onDelete("cascade"),
    uniqueIndex("list_items_household_id_list_id_normalized_name_idx").on(
      table.householdId,
      table.listId,
      table.normalizedName,
    ),
    index("list_items_household_id_list_id_status_sort_key_id_idx").on(
      table.householdId,
      table.listId,
      table.status,
      table.sortKey,
      table.id,
    ),
  ],
);

export const listsRelations = relations(lists, ({ many, one }) => ({
  household: one(households, {
    fields: [lists.householdId],
    references: [households.id],
  }),
  items: many(listItems),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  household: one(households, {
    fields: [listItems.householdId],
    references: [households.id],
  }),
  list: one(lists, {
    fields: [listItems.householdId, listItems.listId],
    references: [lists.householdId, lists.id],
  }),
}));

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    title: text("title").notNull(),
    description: text("description"),
    sortKey: integer("sort_key").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("recipes_household_id_id_idx").on(table.householdId, table.id),
    index("recipes_household_id_sort_key_id_idx")
      .on(table.householdId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    name: text("name").notNull(),
    amount: text("amount"),
    note: text("note"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.recipeId],
      foreignColumns: [recipes.householdId, recipes.id],
      name: "recipe_ingredients_household_recipe_fk",
    }),
    check(
      "recipe_ingredients_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    index("recipe_ingredients_recipe_id_position_id_idx").on(
      table.recipeId,
      table.position,
      table.id,
    ),
  ],
);

export const recipeCookLogs = pgTable(
  "recipe_cook_logs",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    cookedAt: timestamp("cooked_at", { withTimezone: true }).notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.recipeId],
      foreignColumns: [recipes.householdId, recipes.id],
      name: "recipe_cook_logs_household_recipe_fk",
    }),
    unique("recipe_cook_logs_household_recipe_id_unique").on(
      table.householdId,
      table.recipeId,
      table.id,
    ),
    index("recipe_cook_logs_recipe_id_cooked_at_id_idx").on(
      table.recipeId,
      table.cookedAt,
      table.id,
    ),
  ],
);

export const recipesRelations = relations(recipes, ({ many, one }) => ({
  household: one(households, {
    fields: [recipes.householdId],
    references: [households.id],
  }),
  ingredients: many(recipeIngredients),
  cookLogs: many(recipeCookLogs),
  images: many(recipeImages),
}));

export const recipeIngredientsRelations = relations(
  recipeIngredients,
  ({ one }) => ({
    household: one(households, {
      fields: [recipeIngredients.householdId],
      references: [households.id],
    }),
    recipe: one(recipes, {
      fields: [recipeIngredients.householdId, recipeIngredients.recipeId],
      references: [recipes.householdId, recipes.id],
    }),
  }),
);

export const recipeCookLogsRelations = relations(
  recipeCookLogs,
  ({ many, one }) => ({
    household: one(households, {
      fields: [recipeCookLogs.householdId],
      references: [households.id],
    }),
    recipe: one(recipes, {
      fields: [recipeCookLogs.householdId, recipeCookLogs.recipeId],
      references: [recipes.householdId, recipes.id],
    }),
    images: many(recipeImages),
  }),
);

export const householdModuleSettings = pgTable(
  "household_module_settings",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.householdId, table.moduleKey],
      name: "household_module_settings_household_id_module_key_pk",
    }),
  ],
);

export const householdModuleSettingsRelations = relations(
  householdModuleSettings,
  ({ one }) => ({
    household: one(households, {
      fields: [householdModuleSettings.householdId],
      references: [households.id],
    }),
  }),
);

export const recipeImages = pgTable(
  "recipe_images",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    cookLogId: uuid("cook_log_id"),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    position: integer("position").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.recipeId],
      foreignColumns: [recipes.householdId, recipes.id],
      name: "recipe_images_household_recipe_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.recipeId, table.cookLogId],
      foreignColumns: [
        recipeCookLogs.householdId,
        recipeCookLogs.recipeId,
        recipeCookLogs.id,
      ],
      name: "recipe_images_household_recipe_cook_log_fk",
    }),
    check(
      "recipe_images_content_type_allowed",
      sql`${table.contentType} IN ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      "recipe_images_byte_size_range",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`,
    ),
    check("recipe_images_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "recipe_images_dimensions_range",
      sql`${table.width} > 0 AND ${table.width} <= 16384 AND ${table.height} > 0 AND ${table.height} <= 16384`,
    ),
    index("recipe_images_recipe_id_position_id_idx").on(
      table.recipeId,
      table.position,
      table.id,
    ),
    index("recipe_images_cook_log_id_position_id_idx").on(
      table.cookLogId,
      table.position,
      table.id,
    ),
  ],
);

export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  household: one(households, {
    fields: [recipeImages.householdId],
    references: [households.id],
  }),
  recipe: one(recipes, {
    fields: [recipeImages.householdId, recipeImages.recipeId],
    references: [recipes.householdId, recipes.id],
  }),
  cookLog: one(recipeCookLogs, {
    fields: [
      recipeImages.householdId,
      recipeImages.recipeId,
      recipeImages.cookLogId,
    ],
    references: [
      recipeCookLogs.householdId,
      recipeCookLogs.recipeId,
      recipeCookLogs.id,
    ],
  }),
}));
