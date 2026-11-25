import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import {
  householdCreateSuccessSchema as createSuccess,
  householdCommandFailureSchema,
  householdCommandSuccessSchema as success,
} from "@home-hub/shared/zero/household-mutators";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { MutatorResult, Zero } from "@rocicorp/zero";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";

type Client = Pick<Zero, "mutate">;

async function acknowledged<T, F extends string>(
  mutation: MutatorResult,
  schema: { parse: (value: unknown) => T },
  failures: readonly F[],
): Promise<T | { kind: F }> {
  const result = await acknowledgeMutation(mutation);

  if (result.type === "error") {
    if (result.error.type === "app") {
      const failure = householdCommandFailureSchema.parse(result.error.details);
      if (failures.includes(failure.kind as F)) {
        return { kind: failure.kind as F };
      }
      throw Error("Unexpected household command rejection");
    }

    throw Error("Unable to complete household action. Please retry.");
  }

  return schema.parse(result.data);
}

export function createHousehold(zero: Client, input: { name: string }) {
  return acknowledged(
    zero.mutate(mutators.households.create(input)),
    createSuccess,
    ["unauthorized"] as const,
  );
}

export function renameHousehold(
  zero: Client,
  input: { householdId: string; name: string },
) {
  return acknowledged(zero.mutate(mutators.households.rename(input)), success, [
    "unauthorized",
    "forbidden",
  ] as const);
}

export function deleteHousehold(zero: Client, input: { householdId: string }) {
  return acknowledged(zero.mutate(mutators.households.delete(input)), success, [
    "unauthorized",
    "forbidden",
  ] as const);
}

export function leaveHousehold(zero: Client, input: { householdId: string }) {
  return acknowledged(zero.mutate(mutators.households.leave(input)), success, [
    "unauthorized",
    "forbidden",
    "owner_must_transfer",
  ] as const);
}

export function removeHouseholdMember(
  zero: Client,
  input: { householdId: string; membershipId: string },
) {
  return acknowledged(
    zero.mutate(mutators.households.removeMember(input)),
    success,
    ["unauthorized", "forbidden", "invalid_member"] as const,
  );
}

export function transferHouseholdOwnership(
  zero: Client,
  input: { householdId: string; membershipId: string },
) {
  return acknowledged(
    zero.mutate(mutators.households.transferOwnership(input)),
    success,
    ["unauthorized", "forbidden", "invalid_member"] as const,
  );
}

export function setHouseholdModuleEnabled(
  zero: Client,
  input: {
    householdId: string;
    moduleKey: HouseholdModuleKey;
    enabled: boolean;
  },
) {
  return acknowledged(
    zero.mutate(mutators.households.setModule(input)),
    success,
    ["unauthorized", "forbidden", "module_not_configured"] as const,
  );
}

export function revokeHouseholdInvite(
  zero: Client,
  input: { householdId: string; inviteId: string },
) {
  return acknowledged(
    zero.mutate(mutators.households.revokeInvite(input)),
    success,
    ["unauthorized", "forbidden", "invalid_invite"] as const,
  );
}
