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
import { createSetHouseholdModuleEnabledService } from "./households/set-module-enabled";
import { createTransferHouseholdOwnershipService } from "./households/transfer-ownership";
import { createRecipeImageUploadService } from "./recipes/images/create-upload";
import { createR2Client } from "./recipes/images/r2-client";
import { signRecipeImageUpload } from "./recipes/images/sign-upload";
import { createAddShoppingItemService } from "./shopping/add";
import { createSetShoppingItemStatusService } from "./shopping/set-status";
import { createZeroDbProvider } from "./zero/db-provider";

const { db } = createDbClient(config.DATABASE_URL);
const dbProvider = createZeroDbProvider({ db });
const r2Client = createR2Client({
  endpoint: config.R2_ENDPOINT,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});

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
const setHouseholdModuleEnabled = createSetHouseholdModuleEnabledService({
  db,
});
const createRecipeImageUpload = createRecipeImageUploadService({
  db,
  signUpload: ({ objectKey, contentType }) =>
    signRecipeImageUpload({
      client: r2Client,
      bucket: config.R2_BUCKET,
      objectKey,
      contentType,
    }),
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
  createRecipeImageUpload,
  listHouseholds,
  listHouseholdInvites,
  listHouseholdMembers,
  leaveHousehold,
  renameHousehold,
  revokeHouseholdInvite,
  removeHouseholdMember,
  transferHouseholdOwnership,
  setHouseholdModuleEnabled,
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
