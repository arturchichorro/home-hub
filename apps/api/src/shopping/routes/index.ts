import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type CreateAddShoppingItemRouteInput,
  createAddShoppingItemRoute,
} from "./add";

export type CreateShoppingRoutesInput = CreateAddShoppingItemRouteInput & {
  jwtSecret: string;
};

export function createShoppingRoutes(input: CreateShoppingRoutesInput) {
  const shoppingRoutes = new Hono<AuthEnv>();

  shoppingRoutes.post(
    "/:householdId/shopping-items",
    createBearerAuth(input.jwtSecret),
    createAddShoppingItemRoute(input),
  );

  return shoppingRoutes;
}
