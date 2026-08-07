import { drizzleZeroConfig } from "drizzle-zero";

import * as drizzleSchema from "./src/schema";

export default drizzleZeroConfig(drizzleSchema, {
  tables: {
    households: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
    householdMembers: {
      id: true,
      householdId: true,
      userId: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    shoppingItems: {
      id: true,
      householdId: true,
      name: true,
      normalizedName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    recipes: {
      id: true,
      householdId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    recipeIngredients: {
      id: true,
      householdId: true,
      recipeId: true,
      name: true,
      quantity: true,
      unit: true,
      note: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
    recipeCookLogs: {
      id: true,
      householdId: true,
      recipeId: true,
      cookedAt: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
    },
  },
});
