import type { mutators } from "@home-hub/shared/zero/mutators";
import type { Zero } from "@rocicorp/zero";
import { afterEach, expect, it, vi } from "vitest";
import { ContactConflict, writeProfile } from "./mutations";

const id = "10000000-0000-4000-8000-000000000001";
const fields = { name: "Alice", details: [], archived: false };
const input = {
  householdId: id,
  contactId: id,
  writeId: id,
  expectedVersion: null,
  fields,
};
const record = { id, version: 1, fields };

afterEach(() => vi.unstubAllGlobals());

it("uses a Zero mutation, never CRUD HTTP, and waits for server acknowledgement", async () => {
  const fetch = vi.fn(() => {
    throw Error("No CRUD HTTP allowed");
  });
  vi.stubGlobal("fetch", fetch);
  let resolve: (value: unknown) => void = () => undefined;
  const server = new Promise((done) => {
    resolve = done;
  });
  const mutate = vi.fn(
    (_request: ReturnType<typeof mutators.contacts.profile>) => ({
      client: Promise.resolve({ type: "success" }),
      server,
    }),
  );
  const zero = { mutate } as unknown as Pick<Zero, "mutate">;
  let saved = false;
  const pending = writeProfile(zero, input).then((value) => {
    saved = true;
    return value;
  });
  await Promise.resolve();
  expect(saved).toBe(false);
  expect(mutate.mock.calls[0]?.[0].mutator.mutatorName).toBe(
    "contacts.profile",
  );
  expect(mutate.mock.calls[0]?.[0].args).toMatchObject(input);
  resolve({ type: "success", data: { record } });
  expect(await pending).toEqual(record);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves structured Zero conflicts for explicit review instead of retrying over remote edits", async () => {
  const remote = {
    ...record,
    version: 2,
    fields: { ...fields, name: "Remote" },
  };
  const zero = {
    mutate: () => ({
      client: Promise.resolve({ type: "success" }),
      server: Promise.resolve({
        type: "error",
        error: {
          type: "app",
          message: "Changed elsewhere",
          details: { status: 409, record: remote },
        },
      }),
    }),
  } as unknown as Pick<Zero, "mutate">;
  await expect(writeProfile(zero, input)).rejects.toBeInstanceOf(
    ContactConflict,
  );
  await expect(writeProfile(zero, input)).rejects.toMatchObject({
    record: remote,
  });
});
