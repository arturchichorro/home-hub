import { renameHouseholdRequestSchema } from "@home-hub/shared/households";

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
