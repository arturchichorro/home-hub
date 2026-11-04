import { DrizzleQueryError } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import type { ZeroDbProvider } from "./db-provider";
import { safeMutationProvider } from "./safe-mutation-provider";

it("redacts query parameters, nested causes and commit errors before SDK logging", async () => {
  const secret = "private note and measurement 12.5";
  const pg = Object.assign(new Error(secret), {
    code: "23514",
    detail: secret,
  });
  const original = new DrizzleQueryError(
    "UPDATE notes SET note=$1",
    [secret],
    pg,
  );
  const report = vi.fn();
  const provider = {
    transaction: async () => {
      throw original;
    },
  } as unknown as ZeroDbProvider;
  const safe = safeMutationProvider(provider, report);
  let result: unknown;
  try {
    await Reflect.apply(safe.transaction, safe, []);
  } catch (error) {
    result = error;
  }
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toBe(
    "Unable to save changes. Please retry.",
  );
  expect((result as Error).cause).toBeUndefined();
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "23514",
      diagnostic: expect.objectContaining({
        errorCode: "HH_DATABASE_CONSTRAINT",
        operation: "zero.transaction",
      }),
    }),
  );
  expect(JSON.stringify(report.mock.calls)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(secret);
});
it("preserves intentional authorization and reload errors", async () => {
  for (const message of ["Access denied", "Reload Home Hub before logging."]) {
    const error = new Error(message),
      report = vi.fn();
    const provider = {
      transaction: async () => {
        throw error;
      },
    } as unknown as ZeroDbProvider;
    const safe = safeMutationProvider(provider, report);
    await expect(Reflect.apply(safe.transaction, safe, [])).rejects.toBe(error);
    expect(report).not.toHaveBeenCalled();
  }
});
it("preserves provider metadata, this binding and successful transaction values", async () => {
  const provider = {
    marker: 7,
    async transaction() {
      return this.marker;
    },
  };
  const safe = safeMutationProvider(
    provider as unknown as ZeroDbProvider,
    vi.fn(),
  );
  expect(await Reflect.apply(safe.transaction, safe, [])).toBe(7);
});
