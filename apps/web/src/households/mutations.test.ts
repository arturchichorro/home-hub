import type { MutatorResult, Zero } from "@rocicorp/zero";
import { afterEach, expect, it, vi } from "vitest";
import * as commands from "./mutations";

const id = "10000000-0000-4000-8000-000000000001";
const cases = [
  ["createHousehold", "create", { name: "Home" }],
  ["renameHousehold", "rename", { householdId: id, name: "Renamed" }],
  ["deleteHousehold", "delete", { householdId: id }],
  ["leaveHousehold", "leave", { householdId: id }],
  [
    "removeHouseholdMember",
    "removeMember",
    { householdId: id, membershipId: id },
  ],
  [
    "transferHouseholdOwnership",
    "transferOwnership",
    { householdId: id, membershipId: id },
  ],
  [
    "setHouseholdModuleEnabled",
    "setModule",
    { householdId: id, moduleKey: "contacts", enabled: true },
  ],
  ["revokeHouseholdInvite", "revokeInvite", { householdId: id, inviteId: id }],
] as const;

function client(server: MutatorResult["server"]) {
  const mutate = vi.fn((_request: unknown) => ({
    client: Promise.resolve({ type: "success" as const }),
    server,
  }));
  return { mutate, zero: { mutate } as unknown as Pick<Zero, "mutate"> };
}

afterEach(() => vi.unstubAllGlobals());

it.each(cases)(
  "uses Zero and no HTTP for %s",
  async (name, operation, input) => {
    const fetch = vi.fn(() => {
      throw Error("CRUD HTTP forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const { zero, mutate } = client(
      Promise.resolve({
        type: "success",
        data: { kind: "success", household: { id, name: "Home" } },
      }),
    );
    const command = commands[name] as (
      zero: Pick<Zero, "mutate">,
      input: unknown,
    ) => Promise<{ kind: string }>;
    expect((await command(zero, input)).kind).toBe("success");
    const request = mutate.mock.calls[0]?.[0] as {
      mutator: { mutatorName: string };
      args: unknown;
    };
    expect(request.mutator.mutatorName).toBe(`households.${operation}`);
    expect(request.args).toEqual(input);
    expect(request.args).not.toHaveProperty("accessToken");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("does not mark household creation complete until the server acknowledges it", async () => {
  let resolve: (value: Awaited<MutatorResult["server"]>) => void = () =>
    undefined;
  const { zero } = client(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let complete = false;
  const pending = commands
    .createHousehold(zero, { name: "Home" })
    .then((result) => {
      complete = true;
      return result;
    });
  await Promise.resolve();
  expect(complete).toBe(false);
  resolve({
    type: "success",
    data: { kind: "success", household: { id, name: "Home" } },
  });
  expect(await pending).toEqual({
    kind: "success",
    household: { id, name: "Home" },
  });
});

it("preserves authoritative permission/owner failures instead of treating an optimistic result as success", async () => {
  const { zero } = client(
    Promise.resolve({
      type: "error",
      error: {
        type: "app",
        message: "Unavailable",
        details: { kind: "owner_must_transfer" },
      },
    }),
  );
  expect(await commands.leaveHousehold(zero, { householdId: id })).toEqual({
    kind: "owner_must_transfer",
  });
});
