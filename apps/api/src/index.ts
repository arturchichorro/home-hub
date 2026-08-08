import { createDbClient } from "@home-hub/database/client";
import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createLoginService } from "./auth/login";
import { createLogoutService } from "./auth/logout";
import { createMeService } from "./auth/me";
import { createRefreshService } from "./auth/refresh";
import { createSignupService } from "./auth/signup";
import { config } from "./config";
import { createAcceptHouseholdInviteService } from "./households/accept-invite";
import { createHouseholdService } from "./households/create";
import { createHouseholdInviteService } from "./households/create-invite";
import { createLeaveHouseholdService } from "./households/leave";
import { createListHouseholdsService } from "./households/list";
import { createListHouseholdInvitesService } from "./households/list-invites";
import { createListHouseholdMembersService } from "./households/list-members";
import { createRemoveHouseholdMemberService } from "./households/remove-member";
import { createRenameHouseholdService } from "./households/rename";
import { createRevokeHouseholdInviteService } from "./households/revoke-invite";
import { createTransferHouseholdOwnershipService } from "./households/transfer-ownership";
import { createAddShoppingItemService } from "./shopping/add";
import { createSetShoppingItemStatusService } from "./shopping/set-status";
import { createZeroDbProvider } from "./zero/db-provider";

const { db } = createDbClient(config.DATABASE_URL);
const dbProvider = createZeroDbProvider({ db });

const signup = createSignupService({
  db,
  jwtSecret: config.API_JWT_SECRET,
  signupAccessCode: config.SIGNUP_ACCESS_CODE,
});

const login = createLoginService({
  db,
  jwtSecret: config.API_JWT_SECRET,
});

const refresh = createRefreshService({
  db,
  jwtSecret: config.API_JWT_SECRET,
});

const logout = createLogoutService({ db });
const getMe = createMeService({ db });
const acceptHouseholdInvite = createAcceptHouseholdInviteService({ db });
const createHousehold = createHouseholdService({ db });
const createHouseholdInvite = createHouseholdInviteService({ db });
const listHouseholds = createListHouseholdsService({ db });
const listHouseholdInvites = createListHouseholdInvitesService({ db });
const listHouseholdMembers = createListHouseholdMembersService({ db });
const leaveHousehold = createLeaveHouseholdService({ db });
const renameHousehold = createRenameHouseholdService({ db });
const revokeHouseholdInvite = createRevokeHouseholdInviteService({ db });
const addShoppingItem = createAddShoppingItemService({ db });
const setShoppingItemStatus = createSetShoppingItemStatusService({ db });
const removeHouseholdMember = createRemoveHouseholdMemberService({ db });
const transferHouseholdOwnership = createTransferHouseholdOwnershipService({
  db,
});

const app = createApp({
  acceptHouseholdInvite,
  addShoppingItem,
  setShoppingItemStatus,
  signup,
  login,
  refresh,
  logout,
  getMe,
  createHousehold,
  createHouseholdInvite,
  listHouseholds,
  listHouseholdInvites,
  listHouseholdMembers,
  leaveHousehold,
  renameHousehold,
  revokeHouseholdInvite,
  removeHouseholdMember,
  transferHouseholdOwnership,
  dbProvider,
  jwtSecret: config.API_JWT_SECRET,
  isProduction: config.NODE_ENV === "production",
});

serve(
  {
    fetch: app.fetch,
    port: config.API_PORT,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
