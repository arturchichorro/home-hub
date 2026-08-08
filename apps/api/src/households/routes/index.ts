import { Hono } from "hono";

import { type AuthEnv, createBearerAuth } from "../../auth/bearer-auth";
import {
  type AcceptHouseholdInviteRouteInput,
  createAcceptHouseholdInviteRoute,
} from "./accept-invite";
import { type CreateHouseholdRouteInput, createHouseholdRoute } from "./create";
import {
  type CreateHouseholdInviteRouteInput,
  createHouseholdInviteRoute,
} from "./create-invite";
import {
  type CreateListHouseholdsRouteInput,
  createListHouseholdsRoute,
} from "./list";
import {
  createListHouseholdInvitesRoute,
  type ListHouseholdInvitesRouteInput,
} from "./list-invites";
import {
  createListHouseholdMembersRoute,
  type ListHouseholdMembersRouteInput,
} from "./list-members";
import {
  createRemoveHouseholdMemberRoute,
  type RemoveHouseholdMemberRouteInput,
} from "./remove-member";
import {
  createRenameHouseholdRoute,
  type RenameHouseholdRouteInput,
} from "./rename";
import {
  createRevokeHouseholdInviteRoute,
  type RevokeHouseholdInviteRouteInput,
} from "./revoke-invite";

export type CreateHouseholdRoutesInput = AcceptHouseholdInviteRouteInput &
  CreateHouseholdRouteInput &
  CreateHouseholdInviteRouteInput &
  CreateListHouseholdsRouteInput &
  ListHouseholdInvitesRouteInput &
  ListHouseholdMembersRouteInput &
  RenameHouseholdRouteInput &
  RevokeHouseholdInviteRouteInput &
  RemoveHouseholdMemberRouteInput & {
    jwtSecret: string;
  };

export function createHouseholdRoutes(input: CreateHouseholdRoutesInput) {
  const householdRoutes = new Hono<AuthEnv>();

  householdRoutes.post(
    "/",
    createBearerAuth(input.jwtSecret),
    createHouseholdRoute(input),
  );
  householdRoutes.delete(
    "/:householdId/invites/:inviteId",
    createBearerAuth(input.jwtSecret),
    createRevokeHouseholdInviteRoute(input),
  );
  householdRoutes.get(
    "/",
    createBearerAuth(input.jwtSecret),
    createListHouseholdsRoute(input),
  );
  householdRoutes.get(
    "/:householdId/members",
    createBearerAuth(input.jwtSecret),
    createListHouseholdMembersRoute(input),
  );
  householdRoutes.get(
    "/:householdId/invites",
    createBearerAuth(input.jwtSecret),
    createListHouseholdInvitesRoute(input),
  );
  householdRoutes.post(
    "/:householdId/invites",
    createBearerAuth(input.jwtSecret),
    createHouseholdInviteRoute(input),
  );
  householdRoutes.post(
    "/invites/accept",
    createBearerAuth(input.jwtSecret),
    createAcceptHouseholdInviteRoute(input),
  );
  householdRoutes.patch(
    "/:householdId",
    createBearerAuth(input.jwtSecret),
    createRenameHouseholdRoute(input),
  );
  householdRoutes.delete(
    "/:householdId/members/:membershipId",
    createBearerAuth(input.jwtSecret),
    createRemoveHouseholdMemberRoute(input),
  );

  return householdRoutes;
}
