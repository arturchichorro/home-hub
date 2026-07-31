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
  },
});
