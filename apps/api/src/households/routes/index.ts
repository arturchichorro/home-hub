import { Hono } from "hono";

import { type AuthEnv, requireAccount } from "../../auth/bearer-auth";
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
  createDeleteHouseholdRoute,
  type DeleteHouseholdRouteInput,
} from "./delete";
import {
  createLeaveHouseholdRoute,
  type LeaveHouseholdRouteInput,
} from "./leave";
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
import {
  createSetHouseholdModuleEnabledRoute,
  type SetHouseholdModuleEnabledRouteInput,
} from "./set-module-enabled";
import {
  createTransferHouseholdOwnershipRoute,
  type TransferHouseholdOwnershipRouteInput,
} from "./transfer-ownership";

export type CreateHouseholdRoutesInput = AcceptHouseholdInviteRouteInput &
  CreateHouseholdRouteInput &
  CreateHouseholdInviteRouteInput &
  DeleteHouseholdRouteInput &
  CreateListHouseholdsRouteInput &
  LeaveHouseholdRouteInput &
  ListHouseholdInvitesRouteInput &
  ListHouseholdMembersRouteInput &
  RenameHouseholdRouteInput &
  RevokeHouseholdInviteRouteInput &
  TransferHouseholdOwnershipRouteInput &
  SetHouseholdModuleEnabledRouteInput &
  RemoveHouseholdMemberRouteInput;

export function createHouseholdRoutes(input: CreateHouseholdRoutesInput) {
  const householdRoutes = new Hono<AuthEnv>();

  householdRoutes.post("/", requireAccount, createHouseholdRoute(input));
  householdRoutes.delete(
    "/:householdId",
    requireAccount,
    createDeleteHouseholdRoute(input),
  );
  householdRoutes.delete(
    "/:householdId/invites/:inviteId",
    requireAccount,
    createRevokeHouseholdInviteRoute(input),
  );
  householdRoutes.get("/", requireAccount, createListHouseholdsRoute(input));
  householdRoutes.delete(
    "/:householdId/membership",
    requireAccount,
    createLeaveHouseholdRoute(input),
  );
  householdRoutes.get(
    "/:householdId/members",
    requireAccount,
    createListHouseholdMembersRoute(input),
  );
  householdRoutes.get(
    "/:householdId/invites",
    requireAccount,
    createListHouseholdInvitesRoute(input),
  );
  householdRoutes.post(
    "/:householdId/invites",
    requireAccount,
    createHouseholdInviteRoute(input),
  );
  householdRoutes.post(
    "/invites/accept",
    requireAccount,
    createAcceptHouseholdInviteRoute(input),
  );
  householdRoutes.patch(
    "/:householdId",
    requireAccount,
    createRenameHouseholdRoute(input),
  );
  householdRoutes.patch(
    "/:householdId/ownership",
    requireAccount,
    createTransferHouseholdOwnershipRoute(input),
  );
  householdRoutes.patch(
    "/:householdId/modules/:moduleKey",
    requireAccount,
    createSetHouseholdModuleEnabledRoute(input),
  );
  householdRoutes.delete(
    "/:householdId/members/:membershipId",
    requireAccount,
    createRemoveHouseholdMemberRoute(input),
  );

  return householdRoutes;
}
