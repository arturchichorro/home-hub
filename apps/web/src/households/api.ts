// HTTP is reserved for secret invitation exchange. Household data uses Zero.
import {
  type AcceptHouseholdInviteResponse,
  acceptHouseholdInviteRequestSchema,
  acceptHouseholdInviteResponseSchema,
  type CreateHouseholdInviteResponse,
  createHouseholdInviteResponseSchema,
} from "@home-hub/shared/households";

type HouseholdReadCommandInput = { accessToken: string; householdId: string };

export type AcceptHouseholdInviteCommandInput = {
  accessToken: string;
  token: string;
};

export type AcceptHouseholdInviteCommandResult =
  | {
      kind: "success";
      membership: AcceptHouseholdInviteResponse["membership"];
    }
  | { kind: "unauthorized" }
  | { kind: "invalid_invite" }
  | { kind: "already_member" };

export async function acceptHouseholdInvite({
  accessToken,
  token,
}: AcceptHouseholdInviteCommandInput): Promise<AcceptHouseholdInviteCommandResult> {
  const parsedRequest = acceptHouseholdInviteRequestSchema.safeParse({ token });

  if (!parsedRequest.success) {
    return { kind: "invalid_invite" };
  }

  const request = parsedRequest.data;
  const response = await fetch("/api/households/invites/accept", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.status === 400) {
    return { kind: "invalid_invite" };
  }

  if (response.status === 409) {
    return { kind: "already_member" };
  }

  if (!response.ok) {
    throw new Error("Failed to accept household invite");
  }

  const { membership } = acceptHouseholdInviteResponseSchema.parse(
    await response.json(),
  );

  return { kind: "success", membership };
}

export type CreateHouseholdInviteCommandResult =
  | {
      kind: "success";
      invite: CreateHouseholdInviteResponse["invite"];
    }
  | { kind: "unauthorized" }
  | { kind: "forbidden" };

export async function createHouseholdInvite({
  accessToken,
  householdId,
}: HouseholdReadCommandInput): Promise<CreateHouseholdInviteCommandResult> {
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/invites`,
    {
      method: "POST",
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
    throw new Error("Failed to create household invite");
  }

  const { invite } = createHouseholdInviteResponseSchema.parse(
    await response.json(),
  );

  return { kind: "success", invite };
}
