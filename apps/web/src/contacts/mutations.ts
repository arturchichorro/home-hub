import {
  type ContactEntryWrite,
  type ContactWrite,
  contactEntryResponseSchema,
  contactResponseSchema,
} from "@home-hub/shared/contacts";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { MutatorResult, Zero } from "@rocicorp/zero";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";

type ConflictRecord = { id: string; version: number; fields: unknown };

export class ContactConflict extends Error {
  readonly record: ConflictRecord | null;

  constructor(record: ConflictRecord | null) {
    super("Changed elsewhere");
    this.record = record;
  }
}

async function acknowledge(mutation: MutatorResult) {
  const outcome = await acknowledgeMutation(mutation);

  if (outcome.type === "error") {
    const error = outcome.error;
    if (
      error.type === "app" &&
      error.details &&
      typeof error.details === "object" &&
      "status" in error.details &&
      error.details.status === 409
    ) {
      const profile = contactResponseSchema.safeParse(error.details);
      const entry = contactEntryResponseSchema.safeParse(error.details);
      if (profile.success || entry.success) {
        throw new ContactConflict(
          profile.success
            ? profile.data.record
            : entry.success
              ? entry.data.record
              : null,
        );
      }
    }

    throw Error(
      error.type === "app" ? error.message : "Unable to save. Please retry.",
    );
  }

  return outcome.data;
}

export async function writeProfile(
  zero: Pick<Zero, "mutate">,
  input: ContactWrite,
) {
  const { record } = contactResponseSchema.parse(
    await acknowledge(
      zero.mutate(
        mutators.contacts.profile({
          ...input,
          optimisticTimestamp: Date.now(),
        }),
      ),
    ),
  );

  if (!record) {
    throw Error("Contact no longer available");
  }

  return record;
}

export async function writeEntry(
  zero: Pick<Zero, "mutate">,
  input: ContactEntryWrite,
) {
  return contactEntryResponseSchema.parse(
    await acknowledge(
      zero.mutate(
        mutators.contacts.entry({ ...input, optimisticTimestamp: Date.now() }),
      ),
    ),
  ).record;
}
