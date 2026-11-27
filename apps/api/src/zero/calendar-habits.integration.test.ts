import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  calendarHabitAttachments,
  calendarItems,
  habitEntries,
  habits,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import {
  calendarDate,
  habitCompleted,
  shiftCalendarDate,
} from "@home-hub/shared/habits";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const url = process.env.TEST_DATABASE_URL;
describe.runIf(Boolean(url))(
  "personal calendar habit contributions on PostgreSQL",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let hh: string;
    let owner: string;
    let member: string;
    let outsider: string;
    let membership: string;
    let habit: string;
    let second: string;
    const today = calendarDate(Date.now(), "UTC");
    const yesterday = shiftCalendarDate(today, -1);
    const tomorrow = shiftCalendarDate(today, 1);
    beforeAll(() => {
      if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
        throw Error("Owned disposable database required");
      }
      client = createDbClient(url);
    });
    afterAll(async () => {
      await client?.close();
    });
    beforeEach(async () => {
      hh = randomUUID();
      owner = randomUUID();
      member = randomUUID();
      outsider = randomUUID();
      membership = randomUUID();
      habit = randomUUID();
      second = randomUUID();
      await client.db.insert(users).values(
        [owner, member, outsider].map((id) => ({
          id,
          username: id,
          email: `${id}@example.invalid`,
          passwordHash: "fixture",
        })),
      );
      await client.db
        .insert(households)
        .values({ id: hh, name: "Calendar habit fixture" });
      await client.db.insert(householdMembers).values([
        {
          id: randomUUID(),
          householdId: hh,
          userId: owner,
          role: "owner",
          sortKey: 0,
        },
        {
          id: membership,
          householdId: hh,
          userId: member,
          role: "member",
          sortKey: 0,
        },
      ]);
      await client.db.insert(householdModuleSettings).values(
        ["calendar", "habits"].map((moduleKey) => ({
          householdId: hh,
          moduleKey,
          enabled: true,
        })),
      );
      await client.db.insert(habits).values([
        { id: habit, householdId: hh, name: "Climbing" },
        { id: second, householdId: hh, name: "Outside" },
      ]);
    });
    const run = (
      name: string,
      args: Parameters<typeof mutateWithHabitWorkouts>[3],
      userId = owner,
    ) =>
      createZeroDbProvider({ db: client.db }).transaction((tx) =>
        mutateWithHabitWorkouts(tx, userId, name, args),
      );
    const scope = (itemId: string) => ({
      householdId: hh,
      itemId,
      optimisticTimestamp: Date.now(),
    });
    const create = async (day = yesterday, endDay: string | null = null) => {
      const id = randomUUID();
      await run("calendar.create", {
        ...scope(id),
        day,
        endDay,
        title: "Climbing @ Camp Avance",
        note: "",
      });
      return id;
    };
    const attach = (
      id: string,
      habitId: string | null = habit,
      userId = owner,
      timeZone = "UTC",
      confirmArchived = false,
    ) =>
      run(
        "calendar.habit",
        { ...scope(id), habitId, timeZone, confirmArchived },
        userId,
      );
    const entry = async (
      habitId = habit,
      userId = owner,
      entryOn = yesterday,
    ) =>
      (
        await client.db
          .select()
          .from(habitEntries)
          .where(
            and(
              eq(habitEntries.habitId, habitId),
              eq(habitEntries.userId, userId),
              eq(habitEntries.entryOn, entryOn),
            ),
          )
      )[0];
    const privateLink = (id: string, userId = owner) =>
      createZeroDbProvider({ db: client.db }).run(
        queries.calendar.habitAttachment.fn({
          ctx: { userId },
          args: { householdId: hh, itemId: id },
        }),
      );
    const eligible = async (habitId = habit, userId = owner, day = yesterday) =>
      (await entry(habitId, userId, day))?.calendarEligibleAt?.getTime() ??
      null;

    it("credits an old item immediately, exposes only each viewer's link, and shares only date-level habit eligibility", async () => {
      const id = await create();
      await attach(id);
      expect(await eligible()).toBeLessThan(Date.now());
      await run("habits.setCompleted", {
        householdId: hh,
        habitId: habit,
        entryOn: yesterday,
        completed: false,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
      });
      expect(habitCompleted({ calendarEligibleAt: await eligible() })).toBe(
        true,
      );
      expect((await privateLink(id))?.habitId).toBe(habit);
      expect(await privateLink(id, member)).toBeUndefined();
      await attach(id, second, member);
      expect((await privateLink(id))?.habitId).toBe(habit);
      expect((await privateLink(id, member))?.habitId).toBe(second);
      const rows = await createZeroDbProvider({ db: client.db }).run(
        queries.habits.historyForPerson.fn({
          ctx: { userId: owner },
          args: {
            householdId: hh,
            habitId: second,
            personId: member,
            archived: false,
            startOn: yesterday,
            endOn: yesterday,
          },
        }),
      );
      expect(habitCompleted(rows[0]?.entries[0])).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(id);
      expect(JSON.stringify(rows)).not.toContain("timeZone");
      expect(await privateLink(id, outsider)).toBeUndefined();
    });

    it("today and future eligibility is not completion until the captured midnight, without writes or visiting the source", async () => {
      for (const day of [today, tomorrow]) {
        const id = await create(day);
        await attach(id);
        const record = await entry(habit, owner, day);
        const at = record?.calendarEligibleAt?.getTime() ?? null;
        expect(at).toBe(Date.parse(`${shiftCalendarDate(day, 1)}T00:00:00Z`));
        if (at === null) {
          throw Error("Missing eligibility");
        }
        expect(habitCompleted({ calendarEligibleAt: at }, at - 1)).toBe(false);
        expect(habitCompleted({ calendarEligibleAt: at }, at)).toBe(true);
        expect((await entry(habit, owner, day))?.updatedAt).toEqual(
          record?.updatedAt,
        );
      }
    });

    it.each([
      ["2026-10-31", "America/Havana", "2026-11-01T04:00:00Z"],
      ["2027-03-28", "Europe/Brussels", "2027-03-28T22:00:00Z"],
      ["2026-10-25", "Europe/Brussels", "2026-10-25T23:00:00Z"],
      ["2011-12-29", "Pacific/Apia", "2011-12-30T10:00:00Z"],
      ["2026-11-26", "Pacific/Kiritimati", "2026-11-26T10:00:00Z"],
    ])(
      "uses the first midnight for %s in %s, including ambiguous and skipped local days",
      async (day, zone, expected) => {
        await attach(await create(day), habit, owner, zone);
        expect(await eligible(habit, owner, day)).toBe(Date.parse(expected));
      },
    );

    it("keeps captured timezone across shared date edits and no-op selection, replacing it only for a new attachment", async () => {
      const id = await create("2026-10-31");
      await attach(id, habit, owner, "America/Havana");
      await attach(id, habit, owner, "UTC");
      expect((await privateLink(id))?.timeZone).toBe("America/Havana");
      await run(
        "calendar.update",
        { ...scope(id), changes: { day: "2026-11-01" } },
        member,
      );
      expect((await privateLink(id))?.timeZone).toBe("America/Havana");
      expect(await eligible(habit, owner, "2026-10-31")).toBeNull();
      await attach(id, second, owner, "Asia/Tokyo");
      expect((await privateLink(id))?.timeZone).toBe("Asia/Tokyo");
    });

    it("unions duplicate calendar sources and preserves manual, workout, note and creation state when their contribution disappears", async () => {
      await client.db.insert(habitEntries).values({
        householdId: hh,
        habitId: habit,
        userId: owner,
        entryOn: yesterday,
        completed: true,
        workoutCompleted: true,
        note: "Keep this independent note",
      });
      const original = await entry();
      const a = await create();
      const b = await create();
      await attach(a);
      await attach(b);
      const at = await eligible();
      await attach(a, null);
      expect(await eligible()).toBe(at);
      await run("calendar.delete", scope(b), member);
      expect(await eligible()).toBeNull();
      expect(await entry()).toMatchObject({
        completed: true,
        workoutCompleted: true,
        note: original?.note,
        createdAt: original?.createdAt,
      });
      expect(await privateLink(b)).toBeUndefined();
      const links = await client.db
        .select()
        .from(calendarHabitAttachments)
        .where(eq(calendarHabitAttachments.itemId, b));
      expect(links).toEqual([]);
    });

    it("uses the earliest supporting midnight and moves it later when that source is removed", async () => {
      const a = await create("2026-11-27");
      const b = await create("2026-11-27");
      await attach(a, habit, owner, "Asia/Tokyo");
      await attach(b, habit, owner, "UTC");
      const instant = Date.parse("2026-11-27T16:00:00Z");
      expect(
        habitCompleted(
          { calendarEligibleAt: await eligible(habit, owner, "2026-11-27") },
          instant,
        ),
      ).toBe(true);
      await attach(a, null);
      expect(
        habitCompleted(
          { calendarEligibleAt: await eligible(habit, owner, "2026-11-27") },
          instant,
        ),
      ).toBe(false);
    });

    it("a shared date move recalculates all personal owners without exposing or editing their choices", async () => {
      const id = await create();
      await attach(id);
      await attach(id, second, member);
      await run("calendar.update", {
        ...scope(id),
        changes: { day: tomorrow },
      });
      expect(await eligible()).toBeNull();
      expect(await eligible(second, member)).toBeNull();
      expect(await eligible(habit, owner, tomorrow)).toBeGreaterThan(
        Date.now(),
      );
      expect(await eligible(second, member, tomorrow)).toBeGreaterThan(
        Date.now(),
      );
    });

    it("rejects multi-day linking and blocks expansion even when only another member has a private link", async () => {
      const span = await create(yesterday, tomorrow);
      await expect(attach(span)).rejects.toThrow("single-day");
      const id = await create(yesterday, yesterday);
      await attach(id, habit, member);
      await expect(
        run("calendar.update", { ...scope(id), changes: { endDay: today } }),
      ).rejects.toThrow("Remove habit attachments");
      expect(
        (
          await client.db
            .select()
            .from(calendarItems)
            .where(eq(calendarItems.id, id))
        )[0]?.endDay,
      ).toBe(yesterday);
      await attach(id, null, member);
      await run("calendar.update", {
        ...scope(id),
        changes: { endDay: today },
      });
    });

    it("serializes a concurrent attach versus expansion so they cannot both succeed", async () => {
      for (let n = 0; n < 3; n++) {
        const id = await create();
        const outcomes = await Promise.allSettled([
          attach(id, habit, member),
          run("calendar.update", { ...scope(id), changes: { endDay: today } }),
        ]);
        expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(
          1,
        );
        const row = (
          await client.db
            .select()
            .from(calendarItems)
            .where(eq(calendarItems.id, id))
        )[0];
        const links = await client.db
          .select()
          .from(calendarHabitAttachments)
          .where(eq(calendarHabitAttachments.itemId, id));
        expect(
          !!row?.endDay && row.endDay !== row.day && links.length > 0,
        ).toBe(false);
      }
    });

    it("keeps archived contributions live, excludes archived choices, and requires confirmation to remove or replace them", async () => {
      const id = await create(tomorrow);
      await attach(id);
      await run("habits.archive", {
        householdId: hh,
        habitId: habit,
        optimisticTimestamp: Date.now(),
      });
      const at = await eligible(habit, owner, tomorrow);
      if (at === null) {
        throw Error("Missing archived eligibility");
      }
      expect(habitCompleted({ calendarEligibleAt: at }, at)).toBe(true);
      const choices = await createZeroDbProvider({ db: client.db }).run(
        queries.calendar.habitChoices.fn({
          ctx: { userId: owner },
          args: { householdId: hh },
        }),
      );
      expect(choices.map((h) => h.id)).not.toContain(habit);
      await expect(attach(await create(), habit)).rejects.toThrow(
        "Habit unavailable",
      );
      await run("calendar.update", {
        ...scope(id),
        changes: { day: yesterday },
      });
      expect(await eligible()).toBeLessThan(Date.now());
      await expect(attach(id, null)).rejects.toThrow("Confirm removal");
      await attach(id, second, owner, "UTC", true);
      expect(await eligible()).toBeNull();
      expect(await eligible(second)).toBeLessThan(Date.now());
    });

    it("keeps credits when Calendar is disabled, blocks new links when either module is off, and permits hidden-detail removal", async () => {
      const id = await create();
      await attach(id);
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(
          and(
            eq(householdModuleSettings.householdId, hh),
            eq(householdModuleSettings.moduleKey, "calendar"),
          ),
        );
      expect(await eligible()).toBeLessThan(Date.now());
      expect(await privateLink(id)).toBeUndefined();
      await expect(attach(id, second)).rejects.toThrow();
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: true })
        .where(
          and(
            eq(householdModuleSettings.householdId, hh),
            eq(householdModuleSettings.moduleKey, "calendar"),
          ),
        );
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(
          and(
            eq(householdModuleSettings.householdId, hh),
            eq(householdModuleSettings.moduleKey, "habits"),
          ),
        );
      expect((await privateLink(id))?.habit).toBeNull();
      await expect(attach(id, second)).rejects.toThrow();
      await expect(attach(id, null)).rejects.toThrow("Confirm removal");
      await attach(id, null, owner, "UTC", true);
      expect(await eligible()).toBeNull();
    });

    it.each(["leave", "removeMember"])(
      "cleans member links and calendar eligibility on %s without deleting other daily data or restoring links on rejoin",
      async (action) => {
        const id = await create();
        await attach(id, habit, member);
        await client.db
          .update(habitEntries)
          .set({ note: "Keep", completed: true, workoutCompleted: true })
          .where(
            and(
              eq(habitEntries.habitId, habit),
              eq(habitEntries.userId, member),
            ),
          );
        await run(
          `households.${action}`,
          action === "leave"
            ? { householdId: hh }
            : { householdId: hh, membershipId: membership },
          action === "leave" ? member : owner,
        );
        expect(await eligible(habit, member)).toBeNull();
        expect(await entry(habit, member)).toMatchObject({
          completed: true,
          workoutCompleted: true,
          note: "Keep",
        });
        await client.db.insert(householdMembers).values({
          id: randomUUID(),
          householdId: hh,
          userId: member,
          role: "member",
          sortKey: 0,
        });
        expect(await privateLink(id, member)).toBeUndefined();
        await run("calendar.update", {
          ...scope(id),
          changes: { endDay: today },
        });
      },
    );

    it("rejects outsiders, forged owners, foreign habit targets and invalid zones", async () => {
      const id = await create();
      await expect(attach(id, habit, outsider)).rejects.toThrow();
      await expect(
        run("calendar.habit", {
          ...scope(id),
          userId: member,
          habitId: habit,
          timeZone: "UTC",
        }),
      ).rejects.toThrow();
      await expect(attach(id, randomUUID())).rejects.toThrow();
      await expect(attach(id, habit, owner, "not/a/zone")).rejects.toThrow();
      await attach(id, habit, member);
      await attach(id, second, owner);
      expect((await privateLink(id, member))?.habitId).toBe(habit);
    });

    it("publishes the safe eligibility column and private table without adding helpers or summary tables", async () => {
      const publication = await client.db.execute<{ attnames: string[] }>(
        sql`SELECT attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='habit_entries'`,
      );
      expect(publication.rows[0]?.attnames).toContain("calendar_eligible_at");
    });
  },
);
