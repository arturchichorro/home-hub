import type { Database } from "@home-hub/database";
import { describe, expect, it, vi } from "vitest";

import { createMeService } from "./me";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const storedUser = {
  id: "selected-user-id",
  username: "artur",
  email: "artur@example.com",
};

type FindFirstQuery = {
  columns: {
    id: boolean;
    username: boolean;
    email: boolean;
  };
  where: (
    users: { id: unknown },
    operators: { eq: (left: unknown, right: string) => unknown },
  ) => unknown;
};

function createFakeDatabase(user: typeof storedUser | undefined | Error) {
  const findFirst = vi.fn(async (_query: FindFirstQuery) => {
    if (user instanceof Error) {
      throw user;
    }

    return user;
  });
  const db = {
    query: { users: { findFirst } },
  } as unknown as Database;

  return { db, findFirst };
}

describe("me service", () => {
  it("returns the requested user's public fields", async () => {
    const { db, findFirst } = createFakeDatabase(storedUser);
    const getMe = createMeService({ db });

    const result = await getMe(userId);

    expect(result).toEqual({
      kind: "success",
      user: storedUser,
    });
    expect(findFirst).toHaveBeenCalledOnce();

    const query = findFirst.mock.calls[0]?.[0];
    expect(query?.columns).toEqual({
      id: true,
      username: true,
      email: true,
    });

    const idColumn = Symbol("users.id");
    const condition = Symbol("condition");
    const eq = vi.fn(() => condition);

    expect(query?.where({ id: idColumn }, { eq })).toBe(condition);
    expect(eq).toHaveBeenCalledWith(idColumn, userId);
  });

  it("returns not_found when the user does not exist", async () => {
    const { db } = createFakeDatabase(undefined);
    const getMe = createMeService({ db });

    await expect(getMe(userId)).resolves.toEqual({ kind: "not_found" });
  });

  it("propagates database failures", async () => {
    const databaseError = new Error("Database unavailable");
    const { db } = createFakeDatabase(databaseError);
    const getMe = createMeService({ db });

    await expect(getMe(userId)).rejects.toBe(databaseError);
  });
});
