import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
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
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    sortKey: integer("sort_key").notNull(),
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
    index("household_members_user_id_sort_key_id_idx").on(
      table.userId,
      table.sortKey,
      table.id,
    ),
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
  workouts: many(workouts),
  workoutLogs: many(workoutLogs),
  habits: many(habits),
  images: many(recipeImages),
  listItems: many(listItems),
  lists: many(lists),
  members: many(householdMembers),
  moduleSettings: many(householdModuleSettings),
  recipes: many(recipes),
}));

export const householdMembersRelations = relations(
  householdMembers,
  ({ one, many }) => ({
    household: one(households, {
      fields: [householdMembers.householdId],
      references: [households.id],
    }),
    entries: many(habitEntries),
    user: one(users, {
      fields: [householdMembers.userId],
      references: [users.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  householdMemberships: many(householdMembers),
}));

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    note: text("note"),
    sortKey: integer("sort_key").notNull().default(0),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("habits_household_id_id_unique").on(table.householdId, table.id),
    check(
      "habits_name_length",
      sql`length(trim(${table.name})) between 1 and 100`,
    ),
    check(
      "habits_note_length",
      sql`${table.note} IS NULL OR length(${table.note}) <= 500`,
    ),
    check(
      "habits_status_allowed",
      sql`${table.status} IN ('active', 'archived')`,
    ),
    index("habits_household_sort_key_idx")
      .on(table.householdId, table.sortKey, table.id)
      .where(sql`${table.status} = 'active'`),
    index("habits_household_id_status_idx").on(table.householdId, table.status),
  ],
);

export const habitEntries = pgTable(
  "habit_entries",
  {
    householdId: uuid("household_id").notNull(),
    habitId: uuid("habit_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    entryOn: text("entry_on").notNull(),
    completed: boolean("completed").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One record per habit/person/day, shared by note and completion writes.
    primaryKey({ columns: [table.habitId, table.userId, table.entryOn] }),
    foreignKey({
      columns: [table.householdId, table.habitId],
      foreignColumns: [habits.householdId, habits.id],
      name: "habit_entries_household_habit_fk",
    }),
    check(
      "habit_entries_entry_on_date",
      sql`${table.entryOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${table.entryOn}::date::text = ${table.entryOn}`,
    ),
    check(
      "habit_entries_note_length",
      sql`${table.note} IS NULL OR length(${table.note}) <= 500`,
    ),
    index("habit_entries_household_id_date_idx").on(
      table.householdId,
      table.entryOn,
    ),
  ],
);

export const habitsRelations = relations(habits, ({ one, many }) => ({
  household: one(households, {
    fields: [habits.householdId],
    references: [households.id],
  }),
  entries: many(habitEntries),
}));

export const habitEntriesRelations = relations(habitEntries, ({ one }) => ({
  habit: one(habits, {
    fields: [habitEntries.householdId, habitEntries.habitId],
    references: [habits.householdId, habits.id],
  }),
  membership: one(householdMembers, {
    fields: [habitEntries.householdId, habitEntries.userId],
    references: [householdMembers.householdId, householdMembers.userId],
  }),
}));

export const listItemStatusEnum = pgEnum("list_item_status", [
  "active",
  "crossed",
  "archived",
  "deleted",
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
    foreignKey({
      columns: [table.householdId, table.recipeId],
      foreignColumns: [recipes.householdId, recipes.id],
      name: "recipe_ingredients_household_recipe_fk",
    }),
    index("recipe_ingredients_recipe_id_sort_key_id_idx")
      .on(table.recipeId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    index("recipe_cook_logs_recipe_id_cooked_at_id_idx")
      .on(table.recipeId, table.cookedAt, table.id)
      .where(sql`${table.deletedAt} is null`),
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
    sortKey: integer("sort_key").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    check(
      "recipe_images_dimensions_range",
      sql`${table.width} > 0 AND ${table.width} <= 16384 AND ${table.height} > 0 AND ${table.height} <= 16384`,
    ),
    index("recipe_images_recipe_id_sort_key_id_idx")
      .on(table.recipeId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
    index("recipe_images_cook_log_id_sort_key_id_idx")
      .on(table.cookLogId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    exercises: jsonb("exercises").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("workouts_household_id_id").on(t.householdId, t.id),
    check(
      "workouts_title_length",
      sql`length(trim(${t.title})) between 1 and 150`,
    ),
  ],
);
export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workoutId: uuid("workout_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    status: text("status", {
      enum: ["active", "completed", "abandoned"],
    }).notNull(),
    completedOn: text("completed_on"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.householdId, t.workoutId],
      foreignColumns: [workouts.householdId, workouts.id],
    }),
    uniqueIndex("workout_logs_one_active")
      .on(t.householdId, t.userId, t.workoutId)
      .where(sql`${t.status} = 'active'`),
    index("workout_logs_owner").on(
      t.householdId,
      t.userId,
      t.workoutId,
      t.createdAt,
    ),
    check(
      "workout_logs_status",
      sql`${t.status} in ('active', 'completed', 'abandoned')`,
    ),
    check(
      "workout_logs_completion",
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null and ${t.completedOn} is not null)`,
    ),
  ],
);
export const workoutLogSets = pgTable(
  "workout_log_sets",
  {
    logId: uuid("log_id")
      .notNull()
      .references(() => workoutLogs.id),
    exerciseId: uuid("exercise_id").notNull(),
    round: integer("round").notNull(),
    values: jsonb("values").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.logId, t.exerciseId, t.round] }),
    check("workout_log_sets_round", sql`${t.round} between 1 and 10`),
  ],
);
export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  household: one(households, {
    fields: [workouts.householdId],
    references: [households.id],
  }),
  logs: many(workoutLogs),
}));
export const workoutLogsRelations = relations(workoutLogs, ({ one, many }) => ({
  household: one(households, {
    fields: [workoutLogs.householdId],
    references: [households.id],
  }),
  workout: one(workouts, {
    fields: [workoutLogs.householdId, workoutLogs.workoutId],
    references: [workouts.householdId, workouts.id],
  }),
  sets: many(workoutLogSets),
}));
export const workoutLogSetsRelations = relations(workoutLogSets, ({ one }) => ({
  log: one(workoutLogs, {
    fields: [workoutLogSets.logId],
    references: [workoutLogs.id],
  }),
}));

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
