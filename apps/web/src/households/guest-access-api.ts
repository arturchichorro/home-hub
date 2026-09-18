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

async function requireOwnerResponse(response: Response) {
  if (response.status === 401) return "unauthorized" as const;
  if (response.status === 403) return "forbidden" as const;
  if (!response.ok) throw new Error("Guest access request failed");
}

export async function listGuestAccessLinks(input: Input) {
  const response = await fetch(endpoint(input.householdId), {
    headers: headers(input.accessToken),
  });
  const failure = await requireOwnerResponse(response);
  if (failure) return { kind: failure } as const;
  return {
    kind: "success" as const,
    links: listGuestAccessLinksResponseSchema.parse(await response.json())
      .links,
  };
}

export async function createGuestAccessLink(
  input: Input & { name: string; access: GuestAccessLevel },
) {
  const request = createGuestAccessLinkRequestSchema.parse({
    name: input.name,
    access: input.access,
  });
  const response = await fetch(endpoint(input.householdId), {
    method: "POST",
    headers: headers(input.accessToken, true),
    body: JSON.stringify(request),
  });
  const failure = await requireOwnerResponse(response);
  if (failure) return { kind: failure } as const;
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
    enabled?: boolean;
  },
) {
  const request = updateGuestAccessLinkRequestSchema.parse({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.access === undefined ? {} : { access: input.access }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
  });
  const response = await fetch(endpoint(input.householdId, input.linkId), {
    method: "PATCH",
    headers: headers(input.accessToken, true),
    body: JSON.stringify(request),
  });
  const failure = await requireOwnerResponse(response);
  if (failure) return { kind: failure } as const;
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
  const failure = await requireOwnerResponse(response);
  if (failure) return { kind: failure } as const;
  return {
    kind: "success" as const,
    link: regenerateGuestAccessLinkResponseSchema.parse(await response.json())
      .link,
  };
}
