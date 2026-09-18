import type { DatabaseTransaction } from "@home-hub/database";
import type { AccessPrincipal } from "@home-hub/shared/access";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { findActiveUser } from "./active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "./household-access";

export type PrincipalOrLegacyUser =
  | { principal: AccessPrincipal; userId?: never }
  | { principal?: never; userId: string };

export function resolvePrincipal(
  input: PrincipalOrLegacyUser,
): AccessPrincipal {
  return input.principal ?? { kind: "account", userId: input.userId };
}

export async function authorizeHouseholdModule(
  tx: DatabaseTransaction,
  input: {
    principal: AccessPrincipal;
    householdId: string;
    moduleKey: HouseholdModuleKey;
    write: boolean;
  },
): Promise<"unauthorized" | "forbidden" | undefined> {
  if (input.principal.kind === "account") {
    const user = await findActiveUser(tx, input.principal.userId);
    if (!user) return "unauthorized";
    const membership = await findHouseholdMembershipForShare(tx, {
      householdId: input.householdId,
      userId: input.principal.userId,
    });
    if (!membership) return "forbidden";
  } else if (
    input.principal.householdId !== input.householdId ||
    (input.write && input.principal.access !== "write")
  ) {
    return "forbidden";
  }

  const setting = await findEnabledHouseholdModuleForShare(tx, {
    householdId: input.householdId,
    moduleKey: input.moduleKey,
  });
  if (!setting) return "forbidden";
}
