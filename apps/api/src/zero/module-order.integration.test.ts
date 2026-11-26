import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import { enabledHouseholdModules } from "@home-hub/shared/module-order";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;
describe.runIf(Boolean(url))("personal module ordering on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let owner: string;
  let member: string;
  let outsider: string;
  let first: string;
  let second: string;
  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => client?.close());
  beforeEach(async () => {
    owner = randomUUID();
    member = randomUUID();
    outsider = randomUUID();
    first = randomUUID();
    second = randomUUID();
    await client.db.insert(users).values(
      [owner, member, outsider].map((id) => ({
        id,
        username: id,
        email: `${id}@example.invalid`,
        passwordHash: "fixture",
      })),
    );
    await client.db.insert(households).values([
      { id: first, name: "Z household" },
      { id: second, name: "A household" },
    ]);
    await client.db.insert(householdMembers).values([
      {
        id: randomUUID(),
        householdId: first,
        userId: owner,
        role: "owner",
        sortKey: 20,
      },
      {
        id: randomUUID(),
        householdId: second,
        userId: owner,
        role: "owner",
        sortKey: 10,
      },
      {
        id: randomUUID(),
        householdId: first,
        userId: member,
        role: "member",
        sortKey: 0,
      },
    ]);
    await client.db.insert(householdModuleSettings).values([
      { householdId: first, moduleKey: "lists", enabled: true },
      { householdId: first, moduleKey: "recipes", enabled: true },
      { householdId: first, moduleKey: "calendar", enabled: false },
    ]);
  });
  const run = (
    name: string,
    args: Parameters<typeof mutateWithHabitWorkouts>[3],
    actor = member,
  ) =>
    createZeroDbProvider({ db: client.db }).transaction((tx) =>
      mutateWithHabitWorkouts(tx, actor, name, args),
    );
  const reorder = (
    householdId = first,
    actor = member,
    moduleKey = "recipes",
    orderedModuleKeys = ["recipes", "lists"],
  ) =>
    run(
      "householdMemberships.reorderModules",
      { householdId, moduleKey, orderedModuleKeys, optimisticUpdatedAt: 1 },
      actor,
    );
  const mine = (actor = member) =>
    createZeroDbProvider({ db: client.db }).run(
      queries.householdMemberships.mine.fn({
        ctx: { userId: actor },
        args: {},
      }),
    );

  it("lets ordinary members change only their own preference without changing roles, household order or module enablement", async () => {
    const before = (await mine())[0];
    await reorder();
    const after = (await mine())[0];
    expect(after).toMatchObject({
      id: before?.id,
      householdId: first,
      role: "member",
      sortKey: 0,
    });
    expect(after?.moduleOrder).toEqual([
      "calendar",
      "recipes",
      "lists",
      "habits",
      "workouts",
      "documents",
      "contacts",
    ]);
    expect((await mine(owner)).map((row) => row.moduleOrder)).toEqual([[], []]);
    const settings = await client.db
      .select()
      .from(householdModuleSettings)
      .where(eq(householdModuleSettings.householdId, first));
    expect(
      settings.find((setting) => setting.moduleKey === "calendar")?.enabled,
    ).toBe(false);
  });

  it("keeps preferences per household and household ordering independent of names", async () => {
    await reorder(first, owner);
    const rows = await mine(owner);
    expect(rows.map((row) => row.householdId)).toEqual([first, second]);
    expect(rows[0]?.moduleOrder).toContain("recipes");
    expect(rows[1]?.moduleOrder).toEqual([]);
  });

  it("preserves the stored position through disabling and re-enabling a module", async () => {
    await reorder();
    const preference = (await mine())[0]?.moduleOrder;
    const settings = () =>
      createZeroDbProvider({ db: client.db }).run(
        queries.modules.byHousehold.fn({
          ctx: { userId: member },
          args: { householdId: first },
        }),
      );
    expect(enabledHouseholdModules(await settings(), preference)).toEqual([
      "recipes",
      "lists",
    ]);
    await run(
      "households.setModule",
      { householdId: first, moduleKey: "recipes", enabled: false },
      owner,
    );
    expect(enabledHouseholdModules(await settings(), preference)).toEqual([
      "lists",
    ]);
    expect((await mine())[0]?.moduleOrder).toEqual(preference);
    await run(
      "households.setModule",
      { householdId: first, moduleKey: "recipes", enabled: true },
      owner,
    );
    expect(enabledHouseholdModules(await settings(), preference)).toEqual([
      "recipes",
      "lists",
    ]);
  });

  it("rejects outsiders, another household, forged target users and non-content/duplicate keys", async () => {
    await expect(reorder(first, outsider)).rejects.toThrow();
    await expect(reorder(second)).rejects.toThrow();
    for (const patch of [
      { userId: owner },
      { moduleKey: "settings" },
      { orderedModuleKeys: ["recipes", "recipes"] },
      { orderedModuleKeys: ["unknown", "recipes"] },
    ]) {
      await expect(
        run("householdMemberships.reorderModules", {
          householdId: first,
          moduleKey: "recipes",
          orderedModuleKeys: ["recipes", "lists"],
          optimisticUpdatedAt: 1,
          ...patch,
        }),
      ).rejects.toThrow();
    }
    expect((await mine())[0]?.moduleOrder).toEqual([]);
    expect(await mine(outsider)).toEqual([]);
  });

  it("drops preferences when leaving, rejects stale writes and defaults a new membership on rejoin", async () => {
    await reorder();
    await run("households.leave", { householdId: first });
    expect(await mine()).toEqual([]);
    await expect(reorder()).rejects.toThrow();
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId: first,
      userId: member,
      role: "member",
      sortKey: 0,
    });
    expect((await mine())[0]?.moduleOrder).toEqual([]);
  });

  it("rejects ordering a deleted household", async () => {
    await client.db
      .update(households)
      .set({ deletedAt: new Date() })
      .where(eq(households.id, first));
    await expect(reorder()).rejects.toThrow();
    expect(await mine()).toEqual([]);
  });

  it("serializes concurrent moves without erasing an independent move or hidden modules", async () => {
    await Promise.all([
      reorder(first, member, "recipes", ["recipes", "lists"]),
      reorder(first, member, "contacts", ["contacts", "calendar"]),
    ]);
    expect((await mine())[0]?.moduleOrder).toEqual([
      "contacts",
      "calendar",
      "recipes",
      "lists",
      "habits",
      "workouts",
      "documents",
    ]);
    const rows = await client.db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, first),
          eq(householdMembers.userId, member),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
