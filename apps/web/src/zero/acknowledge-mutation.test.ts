import { expect, it, vi } from "vitest";
import { acknowledgeMutation } from "./acknowledge-mutation";

it("preserves client rejection details and does not wait for the server", async () => {
  const error = { type: "error" as const, error: { message: "Conflict" } },
    server = vi.fn();
  const mutation = {
    client: Promise.resolve(error),
    get server() {
      server();
      return new Promise<never>(() => {});
    },
  };
  expect(await acknowledgeMutation(mutation)).toBe(error);
  expect(server).not.toHaveBeenCalled();
});
it("preserves authoritative success and server errors", async () => {
  const client = Promise.resolve({ type: "success" as const });
  const error = { type: "error" as const, error: { message: "Rejected" } };
  expect(
    await acknowledgeMutation({ client, server: Promise.resolve(error) }),
  ).toBe(error);
  const success = { type: "success" as const };
  expect(
    await acknowledgeMutation({ client, server: Promise.resolve(success) }),
  ).toBe(success);
});
it("lets caller-specific failure handling catch thrown errors", async () => {
  const error = Error("closed");
  await expect(
    acknowledgeMutation({
      client: Promise.reject(error),
      server: Promise.resolve({ type: "success" }),
    }),
  ).rejects.toBe(error);
});
