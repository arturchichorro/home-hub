import type { Server } from "node:http";
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
import { createDeleteHouseholdService } from "./households/delete";
import { createLeaveHouseholdService } from "./households/leave";
import { createListHouseholdsService } from "./households/list";
import { createListHouseholdInvitesService } from "./households/list-invites";
import { createListHouseholdMembersService } from "./households/list-members";
import { createRemoveHouseholdMemberService } from "./households/remove-member";
import { createRenameHouseholdService } from "./households/rename";
import { createRevokeHouseholdInviteService } from "./households/revoke-invite";
import { createSetHouseholdModuleEnabledService } from "./households/set-module-enabled";
import { createTransferHouseholdOwnershipService } from "./households/transfer-ownership";
import { inspectR2Object } from "./media/inspect-object";
import { processMediaImage } from "./media/process-image";
import { createR2Client } from "./media/r2-client";
import { signMediaRead } from "./media/sign-read";
import { signMediaUpload } from "./media/sign-upload";
import { consoleStructuredLogger } from "./observability";
import { createDatabaseReadinessCheck } from "./readiness";
import { createConfirmRecipeImageUploadService } from "./recipes/images/confirm-upload";
import { createRecipeImageReadUrlService } from "./recipes/images/create-read-url";
import { createRecipeImageReadUrlsService } from "./recipes/images/create-read-urls";
import { createRecipeImageUploadService } from "./recipes/images/create-upload";
import { createDeleteRecipeImageService } from "./recipes/images/delete";
import { recipeImageMediaIdentity } from "./recipes/images/media-identity";
import { closeHttpServer, createGracefulShutdown } from "./server-lifecycle";
import { createExerciseMediaServices } from "./workouts/exercise-media";
import { createZeroDbProvider } from "./zero/db-provider";

const { db, close: closeDatabase } = createDbClient(config.DATABASE_URL);
const dbProvider = createZeroDbProvider({ db });
const r2Client = createR2Client({
  endpoint: config.R2_ENDPOINT,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});

const infrastructure = { config, db, dbProvider, r2Client };

const auth = {
  signup: createSignupService({
    db: infrastructure.db,
    jwtSecret: infrastructure.config.API_JWT_SECRET,
    signupAccessCode: infrastructure.config.SIGNUP_ACCESS_CODE,
  }),
  login: createLoginService({
    db: infrastructure.db,
    jwtSecret: infrastructure.config.API_JWT_SECRET,
  }),
  refresh: createRefreshService({
    db: infrastructure.db,
    jwtSecret: infrastructure.config.API_JWT_SECRET,
  }),
  logout: createLogoutService({ db: infrastructure.db }),
  getMe: createMeService({ db: infrastructure.db }),
};

const households = {
  acceptHouseholdInvite: createAcceptHouseholdInviteService({
    db: infrastructure.db,
  }),
  createHousehold: createHouseholdService({ db: infrastructure.db }),
  createHouseholdInvite: createHouseholdInviteService({
    db: infrastructure.db,
  }),
  deleteHousehold: createDeleteHouseholdService({ db: infrastructure.db }),
  listHouseholds: createListHouseholdsService({ db: infrastructure.db }),
  listHouseholdInvites: createListHouseholdInvitesService({
    db: infrastructure.db,
  }),
  listHouseholdMembers: createListHouseholdMembersService({
    db: infrastructure.db,
  }),
  leaveHousehold: createLeaveHouseholdService({ db: infrastructure.db }),
  renameHousehold: createRenameHouseholdService({ db: infrastructure.db }),
  revokeHouseholdInvite: createRevokeHouseholdInviteService({
    db: infrastructure.db,
  }),
  removeHouseholdMember: createRemoveHouseholdMemberService({
    db: infrastructure.db,
  }),
  transferHouseholdOwnership: createTransferHouseholdOwnershipService({
    db: infrastructure.db,
  }),
  setHouseholdModuleEnabled: createSetHouseholdModuleEnabledService({
    db: infrastructure.db,
  }),
};

const recipeImages = {
  createRecipeImageUpload: createRecipeImageUploadService({
    db: infrastructure.db,
    signUpload: ({ objectKey, contentType }) =>
      signMediaUpload({
        client: infrastructure.r2Client,
        bucket: infrastructure.config.R2_BUCKET,
        objectKey,
        contentType,
      }),
  }),
  confirmRecipeImageUpload: createConfirmRecipeImageUploadService({
    db: infrastructure.db,
    inspectObject: ({ objectKey }) =>
      inspectR2Object({
        client: infrastructure.r2Client,
        bucket: infrastructure.config.R2_BUCKET,
        objectKey,
      }),
    processDerivatives: (input) =>
      processMediaImage({
        baseUrl: infrastructure.config.IMAGE_DELIVERY_BASE_URL,
        identity: recipeImageMediaIdentity(input),
        contentType: input.contentType,
        byteSize: input.byteSize,
        secret: infrastructure.config.IMAGE_DELIVERY_SIGNING_SECRET,
      }),
  }),
  createRecipeImageReadUrl: createRecipeImageReadUrlService({
    db: infrastructure.db,
    signRead: (input) =>
      signMediaRead({
        baseUrl: infrastructure.config.IMAGE_DELIVERY_BASE_URL,
        identity: recipeImageMediaIdentity(input),
        variant: input.variant,
        secret: infrastructure.config.IMAGE_DELIVERY_SIGNING_SECRET,
      }),
  }),
  createRecipeImageReadUrls: createRecipeImageReadUrlsService({
    db: infrastructure.db,
    signRead: (input) =>
      signMediaRead({
        baseUrl: infrastructure.config.IMAGE_DELIVERY_BASE_URL,
        identity: recipeImageMediaIdentity(input),
        variant: input.variant,
        secret: infrastructure.config.IMAGE_DELIVERY_SIGNING_SECRET,
      }),
  }),
  deleteRecipeImage: createDeleteRecipeImageService({
    db: infrastructure.db,
  }),
};

const exerciseMedia = createExerciseMediaServices({
  db,
  signUpload: (input) =>
    signMediaUpload({ ...input, client: r2Client, bucket: config.R2_BUCKET }),
  inspectObject: (input) =>
    inspectR2Object({ ...input, client: r2Client, bucket: config.R2_BUCKET }),
  processImage: (input) =>
    processMediaImage({
      ...input,
      baseUrl: config.IMAGE_DELIVERY_BASE_URL,
      secret: config.IMAGE_DELIVERY_SIGNING_SECRET,
    }),
  signRead: (input) =>
    signMediaRead({
      ...input,
      baseUrl: config.IMAGE_DELIVERY_BASE_URL,
      secret: config.IMAGE_DELIVERY_SIGNING_SECRET,
    }),
});
const app = createApp({
  auth,
  households,
  recipeImages,
  exerciseMedia,
  infrastructure: {
    zeroDbProvider: infrastructure.dbProvider,
    jwtSecret: infrastructure.config.API_JWT_SECRET,
    isProduction: infrastructure.config.NODE_ENV === "production",
    logger: consoleStructuredLogger,
    readinessCheck: createDatabaseReadinessCheck({ db: infrastructure.db }),
  },
});

const server = serve(
  {
    fetch: app.fetch,
    port: config.API_PORT,
  },
  (info) => {
    consoleStructuredLogger.info({
      event: "server_started",
      port: info.port,
    });
  },
) as Server;

const shutdown = createGracefulShutdown({
  closeServer: () => closeHttpServer(server),
  closeInfrastructure: closeDatabase,
  logger: consoleStructuredLogger,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  });
}
