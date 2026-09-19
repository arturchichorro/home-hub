import {
  createGuestAccessLinkRequestSchema,
  createGuestAccessLinkResponseSchema,
  type GuestAccessLevel,
  listGuestAccessLinksResponseSchema,
  regenerateGuestAccessLinkResponseSchema,
  updateGuestAccessLinkRequestSchema,
  updateGuestAccessLinkResponseSchema,
} from "@home-hub/shared/guest-access";

type Input = { accessToken: string; householdId: string };

function headers(accessToken: string, json = false) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function endpoint(householdId: string, linkId?: string) {
  const base = `/api/households/${encodeURIComponent(householdId)}/guest-access-links`;
  return linkId ? `${base}/${encodeURIComponent(linkId)}` : base;
}

type OwnerRequestFailure = { kind: "unauthorized" } | { kind: "forbidden" };

function ownerRequestFailure(response: Response): OwnerRequestFailure | null {
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) return { kind: "forbidden" };
  if (!response.ok) throw new Error("Guest access request failed");
  return null;
}

export async function listGuestAccessLinks(input: Input) {
  const response = await fetch(endpoint(input.householdId), {
    headers: headers(input.accessToken),
  });
  const failure = ownerRequestFailure(response);
  if (failure) return failure;
  return {
    kind: "success" as const,
    links: listGuestAccessLinksResponseSchema.parse(await response.json())
      .links,
  };
}

export async function createGuestAccessLink(
  input: Input & {
    name: string;
    access: GuestAccessLevel;
    expiresAt?: string;
  },
) {
  const request = createGuestAccessLinkRequestSchema.parse({
    name: input.name,
    access: input.access,
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
  });
  const response = await fetch(endpoint(input.householdId), {
    method: "POST",
    headers: headers(input.accessToken, true),
    body: JSON.stringify(request),
  });
  const failure = ownerRequestFailure(response);
  if (failure) return failure;
  return {
    kind: "success" as const,
    link: createGuestAccessLinkResponseSchema.parse(await response.json()).link,
  };
}

export async function updateGuestAccessLink(
  input: Input & {
    linkId: string;
    name?: string;
    access?: GuestAccessLevel;
    expiresAt?: string;
    enabled?: boolean;
  },
) {
  const request = updateGuestAccessLinkRequestSchema.parse({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.access === undefined ? {} : { access: input.access }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
  });
  const response = await fetch(endpoint(input.householdId, input.linkId), {
    method: "PATCH",
    headers: headers(input.accessToken, true),
    body: JSON.stringify(request),
  });
  const failure = ownerRequestFailure(response);
  if (failure) return failure;
  return {
    kind: "success" as const,
    link: updateGuestAccessLinkResponseSchema.parse(await response.json()).link,
  };
}

export async function regenerateGuestAccessLink(
  input: Input & { linkId: string },
) {
  const response = await fetch(
    `${endpoint(input.householdId, input.linkId)}/regenerate`,
    {
      method: "POST",
      headers: headers(input.accessToken),
    },
  );
  const failure = ownerRequestFailure(response);
  if (failure) return failure;
  return {
    kind: "success" as const,
    link: regenerateGuestAccessLinkResponseSchema.parse(await response.json())
      .link,
  };
}
