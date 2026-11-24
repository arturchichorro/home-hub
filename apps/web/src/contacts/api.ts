import {
  type ContactEntryWrite,
  type ContactWrite,
  contactEntryResponseSchema,
  contactResponseSchema,
} from "@home-hub/shared/contacts";
import type { MediaSession } from "../media/session";

type ConflictRecord = { id: string; version: number; fields: unknown };

export class ContactConflict extends Error {
  readonly record: ConflictRecord | null;
  constructor(record: ConflictRecord | null) {
    super("Changed elsewhere");
    this.record = record;
  }
}

const profileResponse = contactResponseSchema;

const entryResponse = contactEntryResponseSchema;

async function request(
  session: MediaSession,
  householdId: string,
  id: string,
  kind: "profiles" | "entries",
  body?: ContactWrite | ContactEntryWrite,
) {
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/contacts/${kind}/${encodeURIComponent(id)}`,
    {
      method: body ? "PUT" : "GET",
      headers: {
        Authorization: "Bearer " + session.accessToken,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (response.status === 401) {
    session.onSessionExpired();
    throw Error("Session expired");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    const record =
      kind === "profiles"
        ? profileResponse.parse(data).record
        : entryResponse.parse(data).record;
    throw new ContactConflict(record);
  }
  if (!response.ok) {
    throw Error(
      response.status === 403 || response.status === 404
        ? "Contacts no longer available"
        : response.status === 422
          ? String(data.error ?? "Check this entry")
          : "Unable to save. Please retry.",
    );
  }
  return data;
}

export async function writeProfile(session: MediaSession, input: ContactWrite) {
  const record = profileResponse.parse(
    await request(
      session,
      input.householdId,
      input.contactId,
      "profiles",
      input,
    ),
  ).record;
  if (!record) {
    throw Error("Contact no longer available");
  }
  return record;
}

export async function readProfile(
  session: MediaSession,
  householdId: string,
  contactId: string,
) {
  return profileResponse.parse(
    await request(session, householdId, contactId, "profiles"),
  ).record;
}

export async function writeEntry(
  session: MediaSession,
  input: ContactEntryWrite,
) {
  return entryResponse.parse(
    await request(session, input.householdId, input.entryId, "entries", input),
  ).record;
}

export async function readEntry(
  session: MediaSession,
  householdId: string,
  entryId: string,
) {
  return entryResponse.parse(
    await request(session, householdId, entryId, "entries"),
  ).record;
}
