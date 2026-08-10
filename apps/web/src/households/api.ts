import {
  type CreateHouseholdResponse,
  createHouseholdRequestSchema,
  createHouseholdResponseSchema,
  type ListHouseholdInvitesResponse,
  type ListHouseholdMembersResponse,
  listHouseholdInvitesResponseSchema,
  listHouseholdMembersResponseSchema,
  renameHouseholdRequestSchema,
  transferHouseholdOwnershipRequestSchema,
} from "@home-hub/shared/households";
import {
  type HouseholdModuleKey,
  setHouseholdModuleEnabledRequestSchema,
} from "@home-hub/shared/modules";

export type HouseholdReadCommandInput = {
  accessToken: string;
  householdId: string;
};

export type CreateHouseholdCommandInput = {
  accessToken: string;
  name: string;
};

export type CreateHouseholdCommandResult =
  | { kind: "success"; household: CreateHouseholdResponse["household"] }
  | { kind: "unauthorized" };

export async function createHousehold({
  accessToken,
  name,
}: CreateHouseholdCommandInput): Promise<CreateHouseholdCommandResult> {
  const request = createHouseholdRequestSchema.parse({ name });
  const response = await fetch("/households", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) throw new Error("Failed to create household");

  const { household } = createHouseholdResponseSchema.parse(
    await response.json(),
  );

  return { kind: "success", household };
}

export type ListHouseholdMembersCommandResult =
  | { kind: "success"; members: ListHouseholdMembersResponse["members"] }
  | { kind: "unauthorized" }
  | { kind: "forbidden" };

export type ListHouseholdInvitesCommandResult =
  | { kind: "success"; invites: ListHouseholdInvitesResponse["invites"] }
  | { kind: "unauthorized" }
  | { kind: "forbidden" };

export type RenameHouseholdCommandInput = {
  accessToken: string;
  householdId: string;
  name: string;
};

export type RenameHouseholdCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" };

export type RevokeHouseholdInviteCommandInput = HouseholdReadCommandInput & {
  inviteId: string;
};

export type RevokeHouseholdInviteCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_invite" };

export type RemoveHouseholdMemberCommandInput = HouseholdReadCommandInput & {
  membershipId: string;
};

export type RemoveHouseholdMemberCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_member" };

export type LeaveHouseholdCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "owner_must_transfer" };

export type TransferHouseholdOwnershipCommandInput =
  HouseholdReadCommandInput & {
    membershipId: string;
  };

export type TransferHouseholdOwnershipCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_member" };

export type SetHouseholdModuleEnabledCommandInput =
  HouseholdReadCommandInput & {
    moduleKey: HouseholdModuleKey;
    enabled: boolean;
  };

export type SetHouseholdModuleEnabledCommandResult =
  | { kind: "success" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "module_not_configured" };

export async function renameHousehold({
  accessToken,
  householdId,
  name,
}: RenameHouseholdCommandInput): Promise<RenameHouseholdCommandResult> {
  const request = renameHouseholdRequestSchema.parse({ name });
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (!response.ok) {
    throw new Error("Failed to rename household");
  }

  return { kind: "success" };
}

export async function listHouseholdMembers({
  accessToken,
  householdId,
}: HouseholdReadCommandInput): Promise<ListHouseholdMembersCommandResult> {
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/members`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (!response.ok) {
    throw new Error("Failed to list household members");
  }

  const { members } = listHouseholdMembersResponseSchema.parse(
    await response.json(),
  );

  return { kind: "success", members };
}

export async function listHouseholdInvites({
  accessToken,
  householdId,
}: HouseholdReadCommandInput): Promise<ListHouseholdInvitesCommandResult> {
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/invites`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (!response.ok) {
    throw new Error("Failed to list household invites");
  }

  const { invites } = listHouseholdInvitesResponseSchema.parse(
    await response.json(),
  );

  return { kind: "success", invites };
}

export async function revokeHouseholdInvite({
  accessToken,
  householdId,
  inviteId,
}: RevokeHouseholdInviteCommandInput): Promise<RevokeHouseholdInviteCommandResult> {
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/invites/${encodeURIComponent(inviteId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (response.status === 404) {
    return { kind: "invalid_invite" };
  }

  if (!response.ok) {
    throw new Error("Failed to revoke household invite");
  }

  return { kind: "success" };
}

export async function removeHouseholdMember({
  accessToken,
  householdId,
  membershipId,
}: RemoveHouseholdMemberCommandInput): Promise<RemoveHouseholdMemberCommandResult> {
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (response.status === 404) {
    return { kind: "invalid_member" };
  }

  if (!response.ok) {
    throw new Error("Failed to remove household member");
  }

  return { kind: "success" };
}

export async function leaveHousehold({
  accessToken,
  householdId,
}: HouseholdReadCommandInput): Promise<LeaveHouseholdCommandResult> {
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/membership`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (response.status === 409) {
    return { kind: "owner_must_transfer" };
  }

  if (!response.ok) {
    throw new Error("Failed to leave household");
  }

  return { kind: "success" };
}

export async function transferHouseholdOwnership({
  accessToken,
  householdId,
  membershipId,
}: TransferHouseholdOwnershipCommandInput): Promise<TransferHouseholdOwnershipCommandResult> {
  const request = transferHouseholdOwnershipRequestSchema.parse({
    membershipId,
  });
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/ownership`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 403) {
    return { kind: "forbidden" };
  }

  if (response.status === 404) {
    return { kind: "invalid_member" };
  }

  if (!response.ok) {
    throw new Error("Failed to transfer household ownership");
  }

  return { kind: "success" };
}

export async function setHouseholdModuleEnabled({
  accessToken,
  householdId,
  moduleKey,
  enabled,
}: SetHouseholdModuleEnabledCommandInput): Promise<SetHouseholdModuleEnabledCommandResult> {
  const body = setHouseholdModuleEnabledRequestSchema.parse({ enabled });
  const response = await fetch(
    `/households/${encodeURIComponent(householdId)}/modules/${encodeURIComponent(moduleKey)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 409) return { kind: "module_not_configured" };
  if (!response.ok) throw new Error("Failed to update household module");
  return { kind: "success" };
}
