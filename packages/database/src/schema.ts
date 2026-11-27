import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
    moduleOrder: jsonb("module_order").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "household_members_module_order_array",
      sql`jsonb_typeof(${table.moduleOrder}) = 'array'`,
    ),
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
  calendarItems: many(calendarItems),
  workouts: many(workouts),
  trainingSessions: many(trainingSessions),
  habits: many(habits),
  media: many(media),
  images: many(recipeMedia),
  listItems: many(listItems),
  lists: many(lists),
  invites: many(householdInvites),
  members: many(householdMembers),
  moduleSettings: many(householdModuleSettings),
  recipes: many(recipes),
}));

export const householdInvitesRelations = relations(
  householdInvites,
  ({ one }) => ({
    household: one(households, {
      fields: [householdInvites.householdId],
      references: [households.id],
    }),
  }),
);

export const householdMembersRelations = relations(
  householdMembers,
  ({ one, many }) => ({
    household: one(households, {
      fields: [householdMembers.householdId],
      references: [households.id],
    }),
    calendarPeople: many(calendarPeople),
    entries: many(habitEntries),
    user: one(users, {
      fields: [householdMembers.userId],
      references: [users.id],
    }),
  }),
);

export const calendarItems = pgTable(
  "calendar_items",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    day: text("day").notNull(),
    endDay: text("end_day"),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    sortKey: integer("sort_key").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("calendar_items_context").on(t.householdId, t.id),
    index("calendar_items_day_order")
      .on(t.householdId, t.day, t.sortKey, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    check(
      "calendar_items_day",
      sql`${t.day} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${t.day}::date::text = ${t.day}`,
    ),
    check(
      "calendar_items_end_day",
      sql`${t.endDay} IS NULL OR (${t.endDay} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${t.endDay}::date::text = ${t.endDay} AND ${t.endDay} >= ${t.day})`,
    ),
    check(
      "calendar_items_title",
      sql`length(trim(${t.title})) BETWEEN 1 AND 150`,
    ),
    check("calendar_items_note", sql`length(${t.note}) <= 10000`),
  ],
);

// Account identity survives leaving/rejoining. Deliberately no membership FK.
export const calendarPeople = pgTable(
  "calendar_people",
  {
    householdId: uuid("household_id").notNull(),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.userId] }),
    foreignKey({
      columns: [t.householdId, t.itemId],
      foreignColumns: [calendarItems.householdId, calendarItems.id],
      name: "calendar_people_item_fk",
    }),
    index("calendar_people_household_user").on(t.householdId, t.userId),
  ],
);

export const calendarItemsRelations = relations(
  calendarItems,
  ({ one, many }) => ({
    household: one(households, {
      fields: [calendarItems.householdId],
      references: [households.id],
    }),
    people: many(calendarPeople),
    images: many(calendarMedia),
    habitAttachments: many(calendarHabitAttachments),
  }),
);

export const calendarPeopleRelations = relations(calendarPeople, ({ one }) => ({
  item: one(calendarItems, {
    fields: [calendarPeople.householdId, calendarPeople.itemId],
    references: [calendarItems.householdId, calendarItems.id],
  }),
  member: one(householdMembers, {
    fields: [calendarPeople.householdId, calendarPeople.userId],
    references: [householdMembers.householdId, householdMembers.userId],
  }),
}));

// Personal mapping stays private; only its date-based eligibility is shared through habit_entries.
export const calendarHabitAttachments = pgTable(
  "calendar_habit_attachments",
  {
    householdId: uuid("household_id").notNull(),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id").notNull(),
    habitId: uuid("habit_id").notNull(),
    timeZone: text("time_zone").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.userId] }),
    foreignKey({
      columns: [t.householdId, t.itemId],
      foreignColumns: [calendarItems.householdId, calendarItems.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.householdId, t.habitId],
      foreignColumns: [habits.householdId, habits.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }).onDelete("cascade"),
    index("calendar_habit_attachments_habit").on(
      t.householdId,
      t.habitId,
      t.userId,
    ),
    check(
      "calendar_habit_attachments_zone",
      sql`length(${t.timeZone}) BETWEEN 1 AND 100`,
    ),
  ],
);

export const calendarHabitAttachmentsRelations = relations(
  calendarHabitAttachments,
  ({ one }) => ({
    item: one(calendarItems, {
      fields: [
        calendarHabitAttachments.householdId,
        calendarHabitAttachments.itemId,
      ],
      references: [calendarItems.householdId, calendarItems.id],
    }),
    habit: one(habits, {
      fields: [
        calendarHabitAttachments.householdId,
        calendarHabitAttachments.habitId,
      ],
      references: [habits.householdId, habits.id],
    }),
    member: one(householdMembers, {
      fields: [
        calendarHabitAttachments.householdId,
        calendarHabitAttachments.userId,
      ],
      references: [householdMembers.householdId, householdMembers.userId],
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
    workoutMode: text("workout_mode", { enum: ["none", "any", "selected"] })
      .notNull()
      .default("none"),
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
      "habits_workout_mode",
      sql`${table.workoutMode} IN (\x27none\x27, \x27any\x27, \x27selected\x27)`,
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
    workoutCompleted: boolean("workout_completed").notNull().default(false),
    calendarEligibleAt: timestamp("calendar_eligible_at", {
      withTimezone: true,
    }),
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
  workoutLinks: many(habitWorkoutLinks),
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
    kind: text("kind", { enum: ["checklist", "moodboard", "flashcards"] })
      .notNull()
      .default("checklist"),
    mediaCount: integer("media_count").notNull().default(0),
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
    check(
      "lists_kind",
      sql`${table.kind} IN (\'checklist\', \'moodboard\', \'flashcards\')`,
    ),
    check("lists_media_count", sql`${table.mediaCount} >= 0`),
    uniqueIndex("lists_household_id_normalized_name_idx")
      .on(table.householdId, table.normalizedName)
      .where(sql`${table.deletedAt} is null`),
    index("lists_household_id_sort_key_id_idx")
      .on(table.householdId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const listFlashcards = pgTable(
  "list_flashcards",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    listId: uuid("list_id").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
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
      columns: [table.householdId, table.listId],
      foreignColumns: [lists.householdId, lists.id],
      name: "list_flashcards_household_list_fk",
    }),
    check(
      "list_flashcards_front",
      sql`length(${table.front}) BETWEEN 1 AND 10000 AND ${table.front} ~ '[^[:space:]]'`,
    ),
    check(
      "list_flashcards_back",
      sql`length(${table.back}) BETWEEN 1 AND 10000 AND ${table.back} ~ '[^[:space:]]'`,
    ),
    index("list_flashcards_list_sort_id")
      .on(table.householdId, table.listId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const listFlashcardsRelations = relations(listFlashcards, ({ one }) => ({
  list: one(lists, {
    fields: [listFlashcards.householdId, listFlashcards.listId],
    references: [lists.householdId, lists.id],
  }),
}));

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
  attachments: many(listMedia),
  cards: many(listFlashcards),
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
  images: many(recipeMedia),
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
    images: many(recipeMedia),
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

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey(),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    kind: text("kind").notNull(),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    durationMs: integer("duration_ms"),
    videoVersion: text("video_version"),
    animated: boolean("animated"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("media_household_id_id").on(table.householdId, table.id),
    check("media_kind", sql`${table.kind} IN ('image', 'video')`),
    check(
      "media_confirmed_video",
      sql`${table.kind} != \'video\' OR ${table.confirmedAt} IS NULL OR (${table.videoVersion} IS NOT NULL AND ${table.durationMs} IS NOT NULL AND ${table.durationMs} BETWEEN 1 AND 600000 AND ${table.width} <= 4096 AND ${table.height} <= 4096)`,
    ),
    check(
      "media_video_version",
      sql`${table.videoVersion} IS NULL OR (${table.kind} = \'video\' AND ${table.videoVersion} ~ \'^[a-f0-9]{64}$\')`,
    ),
    // Video validation/delivery is enabled only through moodboard attachments.
    check(
      "media_supported_content_type",
      sql`(${table.kind} = 'image' AND ${table.contentType} IN ('image/jpeg', 'image/png', 'image/webp')) OR (${table.kind} = 'video' AND ${table.contentType} IN ('video/mp4', 'video/webm'))`,
    ),
    check(
      "media_byte_size_range",
      sql`${table.byteSize} > 0 AND ((${table.kind} = 'image' AND ${table.byteSize} <= 10485760) OR (${table.kind} = 'video' AND ${table.byteSize} <= 104857600))`,
    ),
    check(
      "media_dimensions_range",
      sql`${table.width} > 0 AND ${table.width} <= 16384 AND ${table.height} > 0 AND ${table.height} <= 16384`,
    ),
    check(
      "media_duration",
      sql`${table.durationMs} IS NULL OR (${table.kind} = 'video' AND ${table.durationMs} > 0)`,
    ),
    check(
      "media_animation",
      sql`${table.animated} IS NULL OR ${table.kind} = 'image'`,
    ),
  ],
);

export const mediaRelations = relations(media, ({ one, many }) => ({
  household: one(households, {
    fields: [media.householdId],
    references: [households.id],
  }),
  recipeAttachments: many(recipeMedia),
  listAttachments: many(listMedia),
  exerciseAttachments: many(exerciseMedia),
  calendarAttachments: many(calendarMedia),
}));

export const listMedia = pgTable(
  "list_media",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    listId: uuid("list_id").notNull(),
    mediaId: uuid("media_id").notNull(),
    sortKey: integer("sort_key").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.householdId, t.listId],
      foreignColumns: [lists.householdId, lists.id],
      name: "list_media_list_fk",
    }),
    foreignKey({
      columns: [t.householdId, t.mediaId],
      foreignColumns: [media.householdId, media.id],
      name: "list_media_asset_fk",
    }),
    index("list_media_order")
      .on(t.householdId, t.listId, t.sortKey, t.id)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const listMediaRelations = relations(listMedia, ({ one }) => ({
  list: one(lists, {
    fields: [listMedia.householdId, listMedia.listId],
    references: [lists.householdId, lists.id],
  }),
  asset: one(media, {
    fields: [listMedia.householdId, listMedia.mediaId],
    references: [media.householdId, media.id],
  }),
}));

export const recipeMedia = pgTable(
  "recipe_media",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    cookLogId: uuid("cook_log_id"),
    mediaId: uuid("media_id").notNull(),
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
      name: "recipe_media_household_recipe_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.recipeId, table.cookLogId],
      foreignColumns: [
        recipeCookLogs.householdId,
        recipeCookLogs.recipeId,
        recipeCookLogs.id,
      ],
      name: "recipe_media_household_recipe_cook_log_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.mediaId],
      foreignColumns: [media.householdId, media.id],
      name: "recipe_media_household_media_fk",
    }),
    index("recipe_media_media_id_idx").on(table.mediaId),
    index("recipe_media_recipe_id_sort_key_id_idx")
      .on(table.recipeId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
    index("recipe_media_cook_log_id_sort_key_id_idx")
      .on(table.cookLogId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey(),
    sortKey: integer("sort_key").notNull().default(0),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("workouts_household_id_id").on(t.householdId, t.id),
    index("workouts_household_sort_key_id").on(t.householdId, t.sortKey, t.id),
    check(
      "workouts_title_length",
      sql`length(trim(${t.title})) between 1 and 150`,
    ),
  ],
);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey(),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    unit: text("unit").notNull(),
    load: text("load").notNull(),
    unilateral: boolean("unilateral").notNull(),
    sortKey: integer("sort_key").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("exercises_household_id_id").on(t.householdId, t.id),
    uniqueIndex("exercises_household_name")
      .on(t.householdId, t.normalizedName)
      .where(sql`${t.deletedAt} IS NULL`),
    index("exercises_household_sort_key_id").on(t.householdId, t.sortKey, t.id),
    check(
      "exercises_name_length",
      sql`length(trim(${t.name})) between 1 and 150`,
    ),
    check("exercises_unit", sql`${t.unit} in ('reps', 'seconds')`),
    check(
      "exercises_load",
      sql`${t.load} in ('per-hand', 'single', 'bodyweight')`,
    ),
  ],
);

export const calendarMedia = pgTable(
  "calendar_media",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    itemId: uuid("item_id").notNull(),
    mediaId: uuid("media_id").notNull(),
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
      columns: [table.householdId, table.itemId],
      foreignColumns: [calendarItems.householdId, calendarItems.id],
      name: "calendar_media_household_item_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.mediaId],
      foreignColumns: [media.householdId, media.id],
      name: "calendar_media_household_media_fk",
    }),
    index("calendar_media_item_sort_id")
      .on(table.householdId, table.itemId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    index("calendar_media_media_id").on(table.mediaId),
  ],
);

export const calendarMediaRelations = relations(calendarMedia, ({ one }) => ({
  item: one(calendarItems, {
    fields: [calendarMedia.householdId, calendarMedia.itemId],
    references: [calendarItems.householdId, calendarItems.id],
  }),
  asset: one(media, {
    fields: [calendarMedia.householdId, calendarMedia.mediaId],
    references: [media.householdId, media.id],
  }),
}));

export const exerciseMedia = pgTable(
  "exercise_media",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    exerciseId: uuid("exercise_id").notNull(),
    mediaId: uuid("media_id").notNull(),
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
      columns: [table.householdId, table.exerciseId],
      foreignColumns: [exercises.householdId, exercises.id],
      name: "exercise_media_household_exercise_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.mediaId],
      foreignColumns: [media.householdId, media.id],
      name: "exercise_media_household_media_fk",
    }),
    index("exercise_media_exercise_sort_id")
      .on(table.householdId, table.exerciseId, table.sortKey, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
    index("exercise_media_media_id").on(table.mediaId),
  ],
);

export const exerciseMediaRelations = relations(exerciseMedia, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseMedia.householdId, exerciseMedia.exerciseId],
    references: [exercises.householdId, exercises.id],
  }),
  asset: one(media, {
    fields: [exerciseMedia.householdId, exerciseMedia.mediaId],
    references: [media.householdId, media.id],
  }),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  images: many(exerciseMedia),
  performances: many(trainingSessionExercises),
  household: one(households, {
    fields: [exercises.householdId],
    references: [households.id],
  }),
}));

export const habitWorkoutLinks = pgTable(
  "habit_workout_links",
  {
    householdId: uuid("household_id").notNull(),
    habitId: uuid("habit_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.habitId, table.workoutId] }),
    foreignKey({
      columns: [table.householdId, table.habitId],
      foreignColumns: [habits.householdId, habits.id],
      name: "habit_workout_links_habit_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.workoutId],
      foreignColumns: [workouts.householdId, workouts.id],
      name: "habit_workout_links_workout_fk",
    }),
    index("habit_workout_links_workout").on(
      table.householdId,
      table.workoutId,
      table.habitId,
    ),
  ],
);

export const habitWorkoutLinksRelations = relations(
  habitWorkoutLinks,
  ({ one }) => ({
    habit: one(habits, {
      fields: [habitWorkoutLinks.householdId, habitWorkoutLinks.habitId],
      references: [habits.householdId, habits.id],
    }),
    workout: one(workouts, {
      fields: [habitWorkoutLinks.householdId, habitWorkoutLinks.workoutId],
      references: [workouts.householdId, workouts.id],
    }),
  }),
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: uuid("id").notNull(),
    householdId: uuid("household_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    sortKey: integer("sort_key").notNull().default(0),
    exerciseId: uuid("exercise_id").notNull(),
    sets: integer("sets").notNull(),
    target: text("target").notNull(),
    role: text("role", { enum: ["warmup", "workout", "stretching"] })
      .notNull()
      .default("workout"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workoutId, t.id] }),
    foreignKey({
      columns: [t.householdId, t.workoutId],
      foreignColumns: [workouts.householdId, workouts.id],
    }),
    index("workout_exercises_workout_order").on(
      t.householdId,
      t.workoutId,
      t.sortKey,
      t.id,
    ),
    foreignKey({
      name: "workout_exercises_catalog_fk",
      columns: [t.householdId, t.exerciseId],
      foreignColumns: [exercises.householdId, exercises.id],
    }),
    check(
      "workout_exercises_role",
      sql`${t.role} IN (\x27warmup\x27, \x27workout\x27, \x27stretching\x27)`,
    ),
    check("workout_exercises_sets", sql`${t.sets} between 1 and 10`),
    check("workout_exercises_target_length", sql`length(${t.target}) <= 100`),
  ],
);

export const workoutExercisesRelations = relations(
  workoutExercises,
  ({ one }) => ({
    workout: one(workouts, {
      fields: [workoutExercises.householdId, workoutExercises.workoutId],
      references: [workouts.householdId, workouts.id],
    }),
    exercise: one(exercises, {
      fields: [workoutExercises.householdId, workoutExercises.exerciseId],
      references: [exercises.householdId, exercises.id],
    }),
  }),
);

// One private model for prescribed and free-form training.
export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workoutId: uuid("workout_id"),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    completedOn: text("completed_on").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("training_sessions_author_id").on(t.householdId, t.userId, t.id),
    foreignKey({
      name: "training_sessions_workout_fk",
      columns: [t.householdId, t.workoutId],
      foreignColumns: [workouts.householdId, workouts.id],
    }),
    uniqueIndex("training_sessions_workout_day")
      .on(t.householdId, t.userId, t.workoutId, t.completedOn)
      .where(sql`${t.workoutId} is not null and ${t.deletedAt} is null`),
    uniqueIndex("training_sessions_free_day")
      .on(t.householdId, t.userId, t.completedOn)
      .where(sql`${t.workoutId} is null and ${t.deletedAt} is null`),
    index("training_sessions_history").on(
      t.householdId,
      t.userId,
      t.completedOn,
      t.completedAt,
      t.id,
    ),
  ],
);

export const trainingSessionExercises = pgTable(
  "training_session_exercises",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id").notNull(),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id").notNull(),
    exerciseId: uuid("exercise_id").notNull(),
    // Historical provenance, not an FK to a mutable/deletable template placement.
    templateExerciseId: uuid("template_exercise_id"),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    load: text("load").notNull(),
    unilateral: boolean("unilateral").notNull(),
    role: text("role", { enum: ["warmup", "workout", "stretching"] }).notNull(),
    plannedSets: integer("planned_sets"),
    target: text("target"),
    // Preserve the original occurrence dates, even if they differ from its session.
    performedOn: text("performed_on").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "training_exercises_session_fk",
      columns: [t.householdId, t.userId, t.sessionId],
      foreignColumns: [
        trainingSessions.householdId,
        trainingSessions.userId,
        trainingSessions.id,
      ],
    }),
    foreignKey({
      name: "training_exercises_catalog_fk",
      columns: [t.householdId, t.exerciseId],
      foreignColumns: [exercises.householdId, exercises.id],
    }),
    uniqueIndex("training_exercises_template_slot")
      .on(t.sessionId, t.templateExerciseId)
      .where(
        sql`${t.templateExerciseId} is not null and ${t.deletedAt} is null`,
      ),
    uniqueIndex("training_exercises_extra_catalog")
      .on(t.sessionId, t.exerciseId)
      .where(sql`${t.templateExerciseId} is null and ${t.deletedAt} is null`),
    index("training_exercises_latest").on(
      t.householdId,
      t.userId,
      t.exerciseId,
      t.performedOn,
      t.performedAt,
      t.id,
    ),
    check(
      "training_exercises_definition",
      sql`${t.unit} in ('reps', 'seconds') and ${t.load} in ('per-hand', 'single', 'bodyweight') and ${t.role} in ('warmup', 'workout', 'stretching')`,
    ),
    check(
      "training_exercises_prescription",
      sql`${t.plannedSets} is null or ${t.plannedSets} between 1 and 10`,
    ),
  ],
);

export const trainingSessionSets = pgTable(
  "training_session_sets",
  {
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => trainingSessionExercises.id),
    round: integer("round").notNull(),
    amount: integer("amount").notNull(),
    rightAmount: integer("right_amount"),
    weightKg: numeric("weight_kg", { mode: "number" }),
    // Actual recorded conventions are facts, not aliases for a current definition.
    unit: text("unit").notNull(),
    load: text("load").notNull(),
    unilateral: boolean("unilateral").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionExerciseId, t.round] }),
    check("training_sets_round", sql`${t.round} between 1 and 10`),
    check("training_sets_amount", sql`${t.amount} between 0 and 600`),
    check(
      "training_sets_right",
      sql`${t.rightAmount} is null or (${t.unilateral} and ${t.rightAmount} between 0 and 600)`,
    ),
    check(
      "training_sets_weight",
      sql`${t.weightKg} is null or (${t.load} <> 'bodyweight' and ${t.weightKg} between 0 and 1000)`,
    ),
    check("training_sets_unit", sql`${t.unit} in ('reps', 'seconds')`),
    check(
      "training_sets_load",
      sql`${t.load} in ('per-hand', 'single', 'bodyweight')`,
    ),
  ],
);

export const trainingSessionsRelations = relations(
  trainingSessions,
  ({ one, many }) => ({
    household: one(households, {
      fields: [trainingSessions.householdId],
      references: [households.id],
    }),
    workout: one(workouts, {
      fields: [trainingSessions.householdId, trainingSessions.workoutId],
      references: [workouts.householdId, workouts.id],
    }),
    exercises: many(trainingSessionExercises),
  }),
);

export const trainingSessionExercisesRelations = relations(
  trainingSessionExercises,
  ({ one, many }) => ({
    session: one(trainingSessions, {
      fields: [
        trainingSessionExercises.householdId,
        trainingSessionExercises.userId,
        trainingSessionExercises.sessionId,
      ],
      references: [
        trainingSessions.householdId,
        trainingSessions.userId,
        trainingSessions.id,
      ],
    }),
    household: one(households, {
      fields: [trainingSessionExercises.householdId],
      references: [households.id],
    }),
    exercise: one(exercises, {
      fields: [
        trainingSessionExercises.householdId,
        trainingSessionExercises.exerciseId,
      ],
      references: [exercises.householdId, exercises.id],
    }),
    sets: many(trainingSessionSets),
  }),
);

export const trainingSessionSetsRelations = relations(
  trainingSessionSets,
  ({ one }) => ({
    occurrence: one(trainingSessionExercises, {
      fields: [trainingSessionSets.sessionExerciseId],
      references: [trainingSessionExercises.id],
    }),
  }),
);

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  household: one(households, {
    fields: [workouts.householdId],
    references: [households.id],
  }),
  logs: many(trainingSessions),
  exercises: many(workoutExercises),
}));

export const recipeMediaRelations = relations(recipeMedia, ({ one }) => ({
  asset: one(media, {
    fields: [recipeMedia.householdId, recipeMedia.mediaId],
    references: [media.householdId, media.id],
  }),
  household: one(households, {
    fields: [recipeMedia.householdId],
    references: [households.id],
  }),
  recipe: one(recipes, {
    fields: [recipeMedia.householdId, recipeMedia.recipeId],
    references: [recipes.householdId, recipes.id],
  }),
  cookLog: one(recipeCookLogs, {
    fields: [
      recipeMedia.householdId,
      recipeMedia.recipeId,
      recipeMedia.cookLogId,
    ],
    references: [
      recipeCookLogs.householdId,
      recipeCookLogs.recipeId,
      recipeCookLogs.id,
    ],
  }),
}));

// Pending files intentionally precede their document: confirmation creates a new
// row only after validation. Retained files keep document context without a cycle.
export const documentFiles = pgTable(
  "document_files",
  {
    id: uuid("id").primaryKey(),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    documentId: uuid("document_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    objectKey: text("object_key").notNull(),
    expectedFileId: uuid("expected_file_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("document_files_context_id").on(t.householdId, t.documentId, t.id),
    check("document_files_size", sql`${t.byteSize} BETWEEN 1 AND 52428800`),
    check(
      "document_files_filename",
      sql`length(${t.filename}) BETWEEN 1 AND 255`,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    title: text("title").notNull(),
    description: text("description"),
    fileId: uuid("file_id").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("documents_household_id_id").on(t.householdId, t.id),
    foreignKey({
      columns: [t.householdId, t.id, t.fileId],
      foreignColumns: [
        documentFiles.householdId,
        documentFiles.documentId,
        documentFiles.id,
      ],
      name: "documents_current_file_fk",
    }),
    check("documents_title", sql`length(trim(${t.title})) BETWEEN 1 AND 200`),
    check(
      "documents_description",
      sql`${t.description} IS NULL OR length(${t.description}) <= 1000`,
    ),
    index("documents_uploaded")
      .on(t.householdId, t.uploadedAt, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    index("documents_title_order")
      .on(t.householdId, t.title, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const documentTags = pgTable(
  "document_tags",
  {
    id: uuid("id").primaryKey(),

    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),

    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    color: text("color", {
      enum: [
        "slate",
        "red",
        "orange",
        "amber",
        "green",
        "teal",
        "blue",
        "violet",
      ],
    }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("document_tags_household_id_id").on(t.householdId, t.id),
    uniqueIndex("document_tags_active_name")
      .on(t.householdId, t.normalizedName)
      .where(sql`${t.deletedAt} IS NULL`),
    check("document_tags_name", sql`length(trim(${t.name})) BETWEEN 1 AND 50`),
    check(
      "document_tags_color",
      sql`${t.color} IN ('slate','red','orange','amber','green','teal','blue','violet')`,
    ),
  ],
);

export const documentTagAssignments = pgTable(
  "document_tag_assignments",
  {
    householdId: uuid("household_id").notNull(),
    documentId: uuid("document_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.tagId] }),
    foreignKey({
      columns: [t.householdId, t.documentId],
      foreignColumns: [documents.householdId, documents.id],
      name: "document_assignment_document_fk",
    }),
    foreignKey({
      columns: [t.householdId, t.tagId],
      foreignColumns: [documentTags.householdId, documentTags.id],
      name: "document_assignment_tag_fk",
    }),
    index("document_assignments_tag").on(t.householdId, t.tagId, t.documentId),
  ],
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  household: one(households, {
    fields: [documents.householdId],
    references: [households.id],
  }),
  file: one(documentFiles, {
    fields: [documents.householdId, documents.id, documents.fileId],
    references: [
      documentFiles.householdId,
      documentFiles.documentId,
      documentFiles.id,
    ],
  }),
  tags: many(documentTagAssignments),
}));

export const documentFilesRelations = relations(documentFiles, ({ one }) => ({
  household: one(households, {
    fields: [documentFiles.householdId],
    references: [households.id],
  }),
}));

export const documentTagsRelations = relations(
  documentTags,
  ({ one, many }) => ({
    household: one(households, {
      fields: [documentTags.householdId],
      references: [households.id],
    }),
    assignments: many(documentTagAssignments),
  }),
);

export const documentTagAssignmentsRelations = relations(
  documentTagAssignments,
  ({ one }) => ({
    document: one(documents, {
      fields: [
        documentTagAssignments.householdId,
        documentTagAssignments.documentId,
      ],
      references: [documents.householdId, documents.id],
    }),
    tag: one(documentTags, {
      fields: [
        documentTagAssignments.householdId,
        documentTagAssignments.tagId,
      ],
      references: [documentTags.householdId, documentTags.id],
    }),
  }),
);

// Bounded ordered profile details use the same revision as the name and archive state.
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    searchText: text("search_text").notNull(),
    details: jsonb("details").notNull().default([]),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    lastWriteId: uuid("last_write_id").notNull(),
    lastWriteHash: text("last_write_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("contacts_context").on(t.householdId, t.id),
    check("contacts_name", sql`length(trim(${t.name})) BETWEEN 1 AND 150`),
    check(
      "contacts_details",
      sql`jsonb_typeof(${t.details})='array' AND jsonb_array_length(${t.details})<=100`,
    ),
    check("contacts_version", sql`${t.version}>0`),
    index("contacts_library").on(
      t.householdId,
      t.archived,
      t.normalizedName,
      t.id,
    ),
  ],
);

export const contactEntries = pgTable(
  "contact_entries",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    entryOn: text("entry_on").notNull(),
    note: text("note").notNull().default(""),
    published: boolean("published").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    lastEditedBy: uuid("last_edited_by")
      .notNull()
      .references(() => users.id),
    lastWriteId: uuid("last_write_id").notNull(),
    lastWriteHash: text("last_write_hash").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("contact_entries_context").on(t.householdId, t.id),
    check(
      "contact_entries_date",
      sql`${t.entryOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${t.entryOn}::date::text=${t.entryOn}`,
    ),
    check("contact_entries_note", sql`length(${t.note})<=20000`),
    check("contact_entries_version", sql`${t.version}>0`),
    index("contact_entries_history")
      .on(t.householdId, t.entryOn, t.createdAt, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const contactEntryPeople = pgTable(
  "contact_entry_people",
  {
    householdId: uuid("household_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    contactId: uuid("contact_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.contactId] }),
    foreignKey({
      columns: [t.householdId, t.entryId],
      foreignColumns: [contactEntries.householdId, contactEntries.id],
      name: "contact_people_entry_fk",
    }),
    foreignKey({
      columns: [t.householdId, t.contactId],
      foreignColumns: [contacts.householdId, contacts.id],
      name: "contact_people_contact_fk",
    }),
    index("contact_people_profile").on(t.householdId, t.contactId, t.entryId),
  ],
);

export const contactMedia = pgTable(
  "contact_media",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    parentId: uuid("parent_id").notNull(),
    contactId: uuid("contact_id"),
    entryId: uuid("entry_id"),
    mediaId: uuid("media_id").notNull(),
    sortKey: integer("sort_key").notNull(),
    published: boolean("published").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.householdId, t.contactId],
      foreignColumns: [contacts.householdId, contacts.id],
      name: "contact_media_profile_fk",
    }),
    foreignKey({
      columns: [t.householdId, t.entryId],
      foreignColumns: [contactEntries.householdId, contactEntries.id],
      name: "contact_media_entry_fk",
    }),
    foreignKey({
      columns: [t.householdId, t.mediaId],
      foreignColumns: [media.householdId, media.id],
      name: "contact_media_asset_fk",
    }),
    check(
      "contact_media_parent",
      sql`(${t.contactId} IS NOT NULL AND ${t.entryId} IS NULL AND ${t.parentId}=${t.contactId}) OR (${t.entryId} IS NOT NULL AND ${t.contactId} IS NULL AND ${t.parentId}=${t.entryId})`,
    ),
    uniqueIndex("contact_media_avatar")
      .on(t.contactId)
      .where(sql`${t.published} AND ${t.deletedAt} IS NULL`),
    index("contact_media_order")
      .on(t.householdId, t.parentId, t.sortKey, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  household: one(households, {
    fields: [contacts.householdId],
    references: [households.id],
  }),
  media: many(contactMedia),
  entries: many(contactEntryPeople),
}));
export const contactEntriesRelations = relations(
  contactEntries,
  ({ one, many }) => ({
    household: one(households, {
      fields: [contactEntries.householdId],
      references: [households.id],
    }),
    people: many(contactEntryPeople),
    media: many(contactMedia),
  }),
);
export const contactEntryPeopleRelations = relations(
  contactEntryPeople,
  ({ one }) => ({
    entry: one(contactEntries, {
      fields: [contactEntryPeople.householdId, contactEntryPeople.entryId],
      references: [contactEntries.householdId, contactEntries.id],
    }),
    contact: one(contacts, {
      fields: [contactEntryPeople.householdId, contactEntryPeople.contactId],
      references: [contacts.householdId, contacts.id],
    }),
  }),
);
export const contactMediaRelations = relations(contactMedia, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactMedia.householdId, contactMedia.contactId],
    references: [contacts.householdId, contacts.id],
  }),
  entry: one(contactEntries, {
    fields: [contactMedia.householdId, contactMedia.entryId],
    references: [contactEntries.householdId, contactEntries.id],
  }),
  asset: one(media, {
    fields: [contactMedia.householdId, contactMedia.mediaId],
    references: [media.householdId, media.id],
  }),
}));
