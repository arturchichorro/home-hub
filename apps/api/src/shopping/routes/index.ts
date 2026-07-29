import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type CreateAddShoppingItemRouteInput,
  createAddShoppingItemRoute,
} from "./add";
import {
  type CreateSetShoppingItemStatusRouteInput,
  createSetShoppingItemStatusRoute,
} from "./set-status";

export type CreateShoppingRoutesInput = CreateAddShoppingItemRouteInput &
  CreateSetShoppingItemStatusRouteInput & {
    jwtSecret: string;
  };

export function createShoppingRoutes(input: CreateShoppingRoutesInput) {
  const shoppingRoutes = new Hono<AuthEnv>();

  shoppingRoutes.post(
    "/items",
    createBearerAuth(input.jwtSecret),
    createAddShoppingItemRoute(input),
  );
  shoppingRoutes.patch(
    "/items/:itemId/status",
    createBearerAuth(input.jwtSecret),
    createSetShoppingItemStatusRoute(input),
  );

  return shoppingRoutes;
}
