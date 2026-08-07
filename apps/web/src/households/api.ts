import {
  type ListHouseholdInvitesResponse,
  type ListHouseholdMembersResponse,
  listHouseholdInvitesResponseSchema,
  listHouseholdMembersResponseSchema,
  renameHouseholdRequestSchema,
} from "@home-hub/shared/households";

export type HouseholdReadCommandInput = {
  accessToken: string;
  householdId: string;
};

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
