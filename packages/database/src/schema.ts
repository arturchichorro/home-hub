import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
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

export const shoppingItemStatusEnum = pgEnum("shopping_item_status", [
  "active",
  "crossed",
  "archived",
]);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: shoppingItemStatusEnum().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("shopping_items_household_id_normalized_name_idx").on(
      table.householdId,
      table.normalizedName,
    ),
  ],
);

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  recipes: many(recipes),
  shoppingItems: many(shoppingItems),
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

export const shoppingItemsRelations = relations(shoppingItems, ({ one }) => ({
  household: one(households, {
    fields: [shoppingItems.householdId],
    references: [households.id],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("recipes_household_id_id_idx").on(table.householdId, table.id),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    name: text("name").notNull(),
    quantity: text("quantity"),
    unit: text("unit"),
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

export const recipeCookLogsRelations = relations(recipeCookLogs, ({ one }) => ({
  household: one(households, {
    fields: [recipeCookLogs.householdId],
    references: [households.id],
  }),
  recipe: one(recipes, {
    fields: [recipeCookLogs.householdId, recipeCookLogs.recipeId],
    references: [recipes.householdId, recipes.id],
  }),
}));
