import type { AttachmentRemovalInput } from "@home-hub/shared/zero/attachment-mutators";
import type { MutatorResult, Zero } from "@rocicorp/zero";
import { afterEach, expect, it, vi } from "vitest";
import { removeAttachment } from "./remove-attachment";

const id = "10000000-0000-4000-8000-000000000001";
const kinds = [
  "recipe",
  "calendar",
  "moodboard",
  "exercise",
  "contact-profile",
  "contact-entry",
] as const;
const input = (kind: AttachmentRemovalInput["kind"]) => ({
  kind,
  householdId: id,
  parentId: id,
  attachmentId: id,
});

function fixture(server: MutatorResult["server"]) {
  const mutate = vi.fn((_request: unknown) => ({
    client: Promise.resolve({ type: "success" as const }),
    server,
  }));
  return { mutate, zero: { mutate } as unknown as Pick<Zero, "mutate"> };
}

afterEach(() => vi.unstubAllGlobals());

it.each(kinds)(
  "uses Zero and no HTTP for %s attachment removal",
  async (kind) => {
    const fetch = vi.fn(() => {
      throw Error("No CRUD HTTP");
    });
    vi.stubGlobal("fetch", fetch);
    const { zero, mutate } = fixture(
      Promise.resolve({ type: "success", data: { kind: "success" } }),
    );
    expect(await removeAttachment(zero, input(kind))).toEqual({
      kind: "success",
    });
    const request = mutate.mock.calls[0]?.[0] as {
      mutator: { mutatorName: string };
      args: unknown;
    };
    expect(request.mutator.mutatorName).toBe("attachments.remove");
    expect(request.args).toMatchObject(input(kind));
    expect(request.args).not.toHaveProperty("accessToken");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("waits for server confirmation and preserves authoritative last-content rejection", async () => {
  let resolve: (value: Awaited<MutatorResult["server"]>) => void = () =>
    undefined;
  const { zero } = fixture(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let settled = false;
  const pending = removeAttachment(zero, input("contact-entry")).then(
    (result) => {
      settled = true;
      return result;
    },
  );
  await Promise.resolve();
  expect(settled).toBe(false);
  resolve({
    type: "error",
    error: {
      type: "app",
      message: "Last content",
      details: { kind: "invalid_action" },
    },
  });
  expect(await pending).toEqual({ kind: "invalid_action" });
});
