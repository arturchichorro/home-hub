import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  householdInvites,
  householdMembers,
  households,
  users,
} from "@home-hub/database/schema";
import { householdCreateSuccessSchema } from "@home-hub/shared/zero/household-mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { schema } from "@home-hub/shared/zero/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))(
  "household Zero commands and invitation metadata",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let owner: string;
    let member: string;
    let outsider: string;
    let householdId: string;
    let membershipId: string;

    beforeAll(() => {
      if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
        throw Error("Owned disposable database required");
      }
      client = createDbClient(url);
    });
    afterAll(async () => client?.close());
    const run = (
      name: string,
      args: Parameters<typeof mutateWithHabitWorkouts>[3],
      userId = owner,
    ) =>
      createZeroDbProvider({ db: client.db }).transaction((tx) =>
        mutateWithHabitWorkouts(tx, userId, `households.${name}`, args),
      );

    beforeEach(async () => {
      owner = randomUUID();
      member = randomUUID();
      outsider = randomUUID();
      membershipId = randomUUID();
      await client.db.insert(users).values(
        [owner, member, outsider].map((id) => ({
          id,
          email: `${id}@example.invalid`,
          username: id,
          passwordHash: "fixture",
        })),
      );
      householdId = householdCreateSuccessSchema.parse(
        await run("create", { name: "Home" }),
      ).household.id;
      await client.db.insert(householdMembers).values({
        id: membershipId,
        householdId,
        userId: member,
        role: "member",
        sortKey: 0,
      });
    });

    it("creates household, owner and default modules in Zero's transaction and rolls them back together", async () => {
      const modules = await createZeroDbProvider({ db: client.db }).run(
        queries.modules.byHousehold.fn({
          args: { householdId },
          ctx: { userId: owner },
        }),
      );
      expect(modules.find((row) => row.moduleKey === "contacts")?.enabled).toBe(
        false,
      );
      await expect(
        createZeroDbProvider({ db: client.db }).transaction(async (tx) => {
          await mutateWithHabitWorkouts(tx, owner, "households.create", {
            name: "Rolled back",
          });
          throw Error("fixture rollback");
        }),
      ).rejects.toThrow("fixture rollback");
      expect(
        await client.db
          .select()
          .from(households)
          .where(eq(households.name, "Rolled back")),
      ).toEqual([]);
    });

    it("keeps owner-only rename/module/delete commands authoritative", async () => {
      for (const actor of [member, outsider]) {
        await expect(
          run("rename", { householdId, name: "Denied" }, actor),
        ).rejects.toMatchObject({ details: { kind: "forbidden" } });
        await expect(
          run(
            "setModule",
            { householdId, moduleKey: "contacts", enabled: true },
            actor,
          ),
        ).rejects.toMatchObject({ details: { kind: "forbidden" } });
        await expect(
          run("delete", { householdId }, actor),
        ).rejects.toMatchObject({ details: { kind: "forbidden" } });
      }
      await run("rename", { householdId, name: "Renamed" });
      await run("setModule", {
        householdId,
        moduleKey: "contacts",
        enabled: true,
      });
      expect(
        (
          await client.db
            .select()
            .from(households)
            .where(eq(households.id, householdId))
        )[0]?.name,
      ).toBe("Renamed");
      await run("delete", { householdId });
      expect(
        (
          await client.db
            .select()
            .from(households)
            .where(eq(households.id, householdId))
        )[0]?.deletedAt,
      ).not.toBeNull();
    });

    it("protects ownership, transfers it transactionally, and supports removal/leaving without elevating members", async () => {
      await expect(run("leave", { householdId })).rejects.toMatchObject({
        details: { kind: "owner_must_transfer" },
      });
      await expect(
        run("transferOwnership", { householdId, membershipId }, member),
      ).rejects.toMatchObject({ details: { kind: "forbidden" } });
      await run("transferOwnership", { householdId, membershipId });
      expect(
        await client.db
          .select()
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, householdId),
              eq(householdMembers.role, "owner"),
            ),
          ),
      ).toHaveLength(1);
      await expect(
        run("removeMember", { householdId, membershipId }),
      ).rejects.toMatchObject({ details: { kind: "forbidden" } });
      await run("leave", { householdId });
      expect(
        await client.db
          .select()
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, householdId),
              eq(householdMembers.userId, owner),
            ),
          ),
      ).toEqual([]);
      const extra = randomUUID();
      await client.db.insert(householdMembers).values({
        id: extra,
        householdId,
        userId: outsider,
        role: "member",
        sortKey: 1,
      });
      await run("removeMember", { householdId, membershipId: extra }, member);
      expect(
        await client.db
          .select()
          .from(householdMembers)
          .where(eq(householdMembers.id, extra)),
      ).toEqual([]);
    });

    it("synchronizes bounded owner-only invitation metadata and never publishes token hashes", async () => {
      const id = randomUUID();
      await client.db.insert(householdInvites).values({
        id,
        householdId,
        creatorId: owner,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const list = (userId: string) =>
        createZeroDbProvider({ db: client.db }).run(
          queries.households.invites.fn({
            args: { householdId, asOf: Date.now() },
            ctx: { userId },
          }),
        );
      expect((await list(owner)).map((row) => row.id)).toEqual([id]);
      expect(await list(member)).toEqual([]);
      expect(await list(outsider)).toEqual([]);
      expect(schema.tables.householdInvites.columns).not.toHaveProperty(
        "tokenHash",
      );
      expect(
        (
          await client.db.execute(
            sql`SELECT attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='household_invites'`,
          )
        ).rows[0]?.attnames,
      ).not.toContain("token_hash");
      await expect(
        run("revokeInvite", { householdId, inviteId: id }, member),
      ).rejects.toMatchObject({ details: { kind: "forbidden" } });
      await run("revokeInvite", { householdId, inviteId: id });
      expect(await list(owner)).toEqual([]);
    });

    it("rejects forged actor fields rather than trusting identity in mutation args", async () => {
      await expect(
        run("rename", { householdId, name: "Denied", userId: owner }, member),
      ).rejects.toThrow();
    });
  },
);
