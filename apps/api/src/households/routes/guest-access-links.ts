import {
  createGuestAccessLinkRequestSchema,
  updateGuestAccessLinkRequestSchema,
} from "@home-hub/shared/guest-access";
import type { Context } from "hono";
import * as z from "zod";
import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  createGuestAccessLinkService,
  createListGuestAccessLinksService,
  createRegenerateGuestAccessLinkService,
  createUpdateGuestAccessLinkService,
} from "../../guest-access/manage";

export type GuestAccessLinkRouteInput = {
  createGuestAccessLink?: ReturnType<typeof createGuestAccessLinkService>;
  listGuestAccessLinks?: ReturnType<typeof createListGuestAccessLinksService>;
  regenerateGuestAccessLink?: ReturnType<
    typeof createRegenerateGuestAccessLinkService
  >;
  updateGuestAccessLink?: ReturnType<typeof createUpdateGuestAccessLinkService>;
};

export type ConfiguredGuestAccessLinkRouteInput =
  Required<GuestAccessLinkRouteInput>;

function parseIds(c: Context<AuthEnv>, includeLinkId: boolean) {
  const householdId = z.uuid().safeParse(c.req.param("householdId"));
  const guestAccessLinkId = includeLinkId
    ? z.uuid().safeParse(c.req.param("guestAccessLinkId"))
    : undefined;
  if (
    !householdId.success ||
    (guestAccessLinkId !== undefined && !guestAccessLinkId.success)
  ) {
    return undefined;
  }
  return {
    householdId: householdId.data,
    ...(guestAccessLinkId === undefined
      ? {}
      : { guestAccessLinkId: guestAccessLinkId.data }),
  };
}

function failureResponse(
  c: Context<AuthEnv>,
  result: { kind: "unauthorized" | "forbidden" | "not_found" },
) {
  if (result.kind === "unauthorized") {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (result.kind === "forbidden") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({ error: "Not found" }, 404);
}

export function createGuestAccessLinkRoute({
  createGuestAccessLink,
}: ConfiguredGuestAccessLinkRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const ids = parseIds(c, false);
    const body = createGuestAccessLinkRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!ids || !body.success) return c.json({ error: "Invalid request" }, 400);

    const result = await createGuestAccessLink({
      userId: c.get("userId"),
      householdId: ids.householdId,
      ...body.data,
    });
    if (result.kind !== "success") return failureResponse(c, result);
    return c.json({ link: { ...result.link, token: result.token } }, 201);
  };
}

export function listGuestAccessLinksRoute({
  listGuestAccessLinks,
}: ConfiguredGuestAccessLinkRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const ids = parseIds(c, false);
    if (!ids) return c.json({ error: "Invalid request" }, 400);

    const result = await listGuestAccessLinks({
      userId: c.get("userId"),
      householdId: ids.householdId,
    });
    if (result.kind !== "success") return failureResponse(c, result);
    return c.json({ links: result.links }, 200);
  };
}

export function updateGuestAccessLinkRoute({
  updateGuestAccessLink,
}: ConfiguredGuestAccessLinkRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const ids = parseIds(c, true);
    const body = updateGuestAccessLinkRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!ids?.guestAccessLinkId || !body.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await updateGuestAccessLink({
      userId: c.get("userId"),
      householdId: ids.householdId,
      guestAccessLinkId: ids.guestAccessLinkId,
      ...body.data,
    });
    if (result.kind !== "success") return failureResponse(c, result);
    return c.json({ link: result.link }, 200);
  };
}

export function regenerateGuestAccessLinkRoute({
  regenerateGuestAccessLink,
}: ConfiguredGuestAccessLinkRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const ids = parseIds(c, true);
    if (!ids?.guestAccessLinkId) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await regenerateGuestAccessLink({
      userId: c.get("userId"),
      householdId: ids.householdId,
      guestAccessLinkId: ids.guestAccessLinkId,
    });
    if (result.kind !== "success") return failureResponse(c, result);
    return c.json({ link: { ...result.link, token: result.token } }, 200);
  };
}
