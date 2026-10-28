import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  exerciseMedia,
  exercises,
  householdMembers,
  householdModuleSettings,
  households,
  media,
  users,
  workoutExercises,
  workoutLogSets,
  workoutLogs,
  workouts,
} from "@home-hub/database/schema";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { InvalidMediaUploadError } from "../media/process-image";
import { createZeroDbProvider } from "../zero/db-provider";
import { createExerciseMediaServices } from "./exercise-media";

const databaseUrl = process.env.MEDIA_TEST_DATABASE_URL;
describe.runIf(Boolean(databaseUrl))("exercise media on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let userId: string,
    householdId: string,
    exerciseId: string,
    foreignHouseholdId: string,
    foreignExerciseId: string;
  const signUpload = vi.fn(async () => "https://upload.example/object");
  const inspectObject = vi.fn(async () => ({
    contentType: "image/png",
    byteSize: 42,
  }));
  const processImage = vi.fn(async () => undefined);
  const signRead = vi.fn(async () => "https://images.example/authorized");
  const services = () =>
    createExerciseMediaServices({
      db: client.db,
      signUpload,
      inspectObject,
      processImage,
      signRead,
    });
  const scope = () => ({ userId, householdId, exerciseId });
  const upload = () =>
    services().createUpload({
      ...scope(),
      contentType: "image/png",
      byteSize: 42,
      width: 640,
      height: 480,
    });
  beforeAll(() => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.startsWith("/media_migration_")
    )
      throw new Error("Disposable migration database required");
    client = createDbClient(databaseUrl);
  });
  afterAll(async () => {
    if (client) await client.close();
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    signUpload.mockResolvedValue("https://upload.example/object");
    inspectObject.mockResolvedValue({
      contentType: "image/png",
      byteSize: 42,
    });
    signRead.mockResolvedValue("https://images.example/authorized");
    userId = randomUUID();
    householdId = randomUUID();
    exerciseId = randomUUID();
    foreignHouseholdId = randomUUID();
    foreignExerciseId = randomUUID();
    await client.db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      username: userId,
      passwordHash: "test-only",
    });
    await client.db.insert(households).values([
      { id: householdId, name: "Exercise media" },
      { id: foreignHouseholdId, name: "Other household" },
    ]);
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId,
      role: "owner",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId, moduleKey: "workouts", enabled: true });
    await client.db.insert(exercises).values([
      {
        id: exerciseId,
        householdId,
        name: "Push-up",
        normalizedName: "push-up",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      },
      {
        id: foreignExerciseId,
        householdId: foreignHouseholdId,
        name: "Foreign exercise",
        normalizedName: "foreign exercise",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      },
    ]);
  });
  async function pending() {
    const result = await upload();
    if (result.kind !== "success") throw new Error("Upload denied");
    return result;
  }
  const read = (attachmentId: string, targetExerciseId = exerciseId) =>
    services().readUrls({
      userId,
      householdId,
      requests: [
        { exerciseId: targetExerciseId, attachmentId, variant: "thumbnail" },
      ],
    });

  it("shows only each workout's latest local completion for the current author", async () => {
    const provider = createZeroDbProvider({ db: client.db });
    const workoutId = randomUUID(),
      emptyId = randomUUID(),
      otherUser = randomUUID(),
      latestId = randomUUID();
    await client.db.insert(workouts).values([
      { id: workoutId, householdId, title: "Logged", notes: "", sortKey: 2 },
      {
        id: emptyId,
        householdId,
        title: "Not logged",
        notes: "",
        sortKey: 1,
      },
    ]);
    await client.db.insert(users).values({
      id: otherUser,
      email: `${otherUser}@example.invalid`,
      username: otherUser,
      passwordHash: "test",
    });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId,
      userId: otherUser,
      role: "member",
      sortKey: 0,
    });
    const base = {
      householdId,
      workoutId,
      snapshot: { title: "Logged", exercises: [] },
      completedAt: new Date("2026-06-17T18:00:00Z"),
    };
    await client.db.insert(workoutLogs).values([
      {
        ...base,
        id: randomUUID(),
        userId,
        completedOn: "2026-06-15",
        createdAt: new Date("2026-10-27T12:00:00Z"),
        note: "Backfilled old day",
      },
      {
        ...base,
        id: latestId,
        userId,
        completedOn: "2026-06-17",
        createdAt: new Date("2026-06-17T18:00:00Z"),
        note: "Own private note",
      },
      {
        ...base,
        id: randomUUID(),
        userId: otherUser,
        completedOn: "2026-10-27",
        note: "OTHER AUTHOR SECRET",
      },
    ]);
    const rows = await provider.run(
      queries.workouts.byHousehold.fn({
        ctx: { userId },
        args: { householdId },
      }),
    );
    expect(
      rows
        .find((row) => row.id === workoutId)
        ?.logs.map((log) => ({ id: log.id, day: log.completedOn })),
    ).toEqual([{ id: latestId, day: "2026-06-17" }]);
    expect(rows.find((row) => row.id === emptyId)?.logs).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain("OTHER AUTHOR SECRET");
    const theirs = await provider.run(
      queries.workouts.byHousehold.fn({
        ctx: { userId: otherUser },
        args: { householdId },
      }),
    );
    expect(
      theirs.find((row) => row.id === workoutId)?.logs[0]?.completedOn,
    ).toBe("2026-10-27");
    expect(JSON.stringify(theirs)).not.toContain("Own private note");
  });
  it("deletes catalog links atomically, preserves completed logs/media, and recreates names with fresh identities", async () => {
    const workoutId = randomUUID(),
      slotId = randomUUID(),
      logId = randomUUID();
    await client.db.insert(workouts).values({
      id: workoutId,
      householdId,
      title: "Before",
      notes: "",
      sortKey: 1,
    });
    await client.db.insert(workoutExercises).values({
      id: slotId,
      workoutId,
      householdId,
      exerciseId,
      sets: 3,
      target: "8",
      sortKey: 1,
    });
    await client.db.insert(workoutLogs).values({
      id: logId,
      householdId,
      userId,
      workoutId,
      note: "Private note",
      completedOn: "2026-10-27",
      completedAt: new Date(),
      snapshot: {
        title: "Before",
        exercises: [
          {
            id: slotId,
            catalogExerciseId: exerciseId,
            name: "Push-up",
            sets: 3,
            target: "8",
            unit: "reps",
            load: "bodyweight",
            unilateral: false,
          },
        ],
      },
    });
    await client.db.insert(workoutLogSets).values({
      logId,
      householdId,
      workoutExerciseId: slotId,
      exerciseId,
      round: 1,
      amount: 8,
      rightAmount: null,
      weightKg: null,
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
    });
    const image = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: image.attachmentId,
    });
    const beforeLogs = await client.db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.id, logId));
    const beforeSets = await client.db
      .select()
      .from(workoutLogSets)
      .where(eq(workoutLogSets.logId, logId));
    const provider = createZeroDbProvider({ db: client.db });
    await provider.transaction((tx) =>
      mutators.workouts.deleteExercise.fn({
        tx,
        ctx: { userId },
        args: { householdId, exerciseId, optimisticTimestamp: 1 },
      }),
    );
    expect(
      await client.db
        .select()
        .from(workoutExercises)
        .where(eq(workoutExercises.exerciseId, exerciseId)),
    ).toHaveLength(0);
    expect(
      await client.db
        .select()
        .from(workoutLogs)
        .where(eq(workoutLogs.id, logId)),
    ).toEqual(beforeLogs);
    expect(
      await client.db
        .select()
        .from(workoutLogSets)
        .where(eq(workoutLogSets.logId, logId)),
    ).toEqual(beforeSets);
    expect(
      await client.db
        .select()
        .from(exerciseMedia)
        .where(eq(exerciseMedia.id, image.attachmentId)),
    ).toHaveLength(1);
    expect(await read(image.attachmentId)).toMatchObject({
      kind: "success",
      reads: [],
    });
    expect(await upload()).toEqual({ kind: "not_found" });
    const replacement = randomUUID();
    await provider.transaction((tx) =>
      mutators.workouts.createExercise.fn({
        tx,
        ctx: { userId },
        args: {
          householdId,
          exercise: {
            id: replacement,
            name: "Push-up",
            unit: "reps",
            load: "single",
            unilateral: true,
          },
          optimisticTimestamp: 1,
        },
      }),
    );
    const visible = await provider.run(
      queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
    );
    expect(visible.map((row) => row.id)).toEqual([replacement]);
    expect(visible[0]?.load).toBe("single");
    expect(
      await provider.run(
        queries.workouts.exerciseMedia.fn({
          ctx: { userId },
          args: { householdId, exerciseId: replacement },
        }),
      ),
    ).toEqual([]);
    await expect(
      provider.transaction((tx) =>
        mutators.workouts.updateExercise.fn({
          tx,
          ctx: { userId },
          args: {
            householdId,
            exerciseId,
            changes: { name: "Stale" },
            optimisticTimestamp: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("serializes deletion with slot additions and media uploads without leaving dangling current slots", async () => {
    const workoutId = randomUUID();
    await client.db.insert(workouts).values({
      id: workoutId,
      householdId,
      title: "Concurrent",
      notes: "",
      sortKey: 1,
    });
    const provider = createZeroDbProvider({ db: client.db });
    const outcomes = await Promise.allSettled([
      provider.transaction((tx) =>
        mutators.workouts.deleteExercise.fn({
          tx,
          ctx: { userId },
          args: { householdId, exerciseId, optimisticTimestamp: 1 },
        }),
      ),
      provider.transaction((tx) =>
        mutators.workouts.editExercises.fn({
          tx,
          ctx: { userId },
          args: {
            householdId,
            workoutId,
            optimisticTimestamp: 1,
            updates: [],
            deletes: [],
            creates: [
              {
                id: randomUUID(),
                catalogExerciseId: exerciseId,
                name: "Push-up",
                unit: "reps",
                load: "bodyweight",
                unilateral: false,
                sets: 3,
                target: "8",
              },
            ],
          },
        }),
      ),
      upload(),
    ]);
    expect(outcomes[0]?.status).toBe("fulfilled");
    expect(
      await client.db
        .select()
        .from(workoutExercises)
        .where(eq(workoutExercises.exerciseId, exerciseId)),
    ).toHaveLength(0);
    const [row] = await client.db
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  }, 15_000);
  it("serializes duplicate creation and preserves catalog order through the real adapter", async () => {
    const provider = createZeroDbProvider({ db: client.db }),
      ids = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled(
      ids.map((id) =>
        provider.transaction((tx) =>
          mutators.workouts.createExercise.fn({
            tx,
            ctx: { userId },
            args: {
              householdId,
              exercise: {
                id,
                name: "Cable row",
                unit: "reps",
                load: "single",
                unilateral: false,
              },
              optimisticTimestamp: 1,
            },
          }),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const before = await provider.run(
      queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
    );
    expect(before).toHaveLength(2);
    await provider.transaction((tx) =>
      mutators.workouts.reorderExercises.fn({
        tx,
        ctx: { userId },
        args: {
          householdId,
          exerciseId,
          orderedExerciseIds: [
            exerciseId,
            ...before
              .filter((row) => row.id !== exerciseId)
              .map((row) => row.id),
          ],
          optimisticTimestamp: 1,
        },
      }),
    );
    const after = await provider.run(
      queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
    );
    expect(after[0]?.id).toBe(exerciseId);
    await expect(
      provider.transaction((tx) =>
        mutators.workouts.deleteExercise.fn({
          tx,
          ctx: { userId },
          args: {
            householdId,
            exerciseId: foreignExerciseId,
            optimisticTimestamp: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("creates distinct asset/attachment identities and confirms a reusable Workouts capability", async () => {
    const result = await pending();
    const [attachment] = await client.db
      .select()
      .from(exerciseMedia)
      .where(eq(exerciseMedia.id, result.attachmentId));
    if (!attachment) throw new Error("Missing attachment");
    expect(attachment.mediaId).not.toBe(result.attachmentId);
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toMatchObject({
      kind: "success",
      attachment: { id: result.attachmentId },
    });
    const [asset] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, attachment.mediaId));
    expect(asset).toMatchObject({
      kind: "image",
      animated: false,
      objectKey: `households/${householdId}/media/${attachment.mediaId}`,
    });
    expect(processImage).toHaveBeenCalledWith({
      identity: {
        householdId,
        mediaId: attachment.mediaId,
        storageRecipeId: null,
        moduleKey: "workouts",
        parentId: exerciseId,
        attachmentId: result.attachmentId,
      },
      contentType: "image/png",
      byteSize: 42,
    });
    expect(await read(result.attachmentId)).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: result.attachmentId, exerciseId }],
    });
    expect(signRead).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          moduleKey: "workouts",
          parentId: exerciseId,
          attachmentId: result.attachmentId,
        }),
      }),
    );
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });
    expect(inspectObject).toHaveBeenCalledOnce();
    expect(processImage).toHaveBeenCalledOnce();
  });
  it("persists picture ordering through the actual Zero/Drizzle transaction adapter", async () => {
    const items: Awaited<ReturnType<typeof pending>>[] = [];
    for (let i = 0; i < 4; i++) items.push(await pending());
    for (const item of items.slice(0, 3))
      await services().confirmUpload({
        ...scope(),
        attachmentId: item.attachmentId,
      });
    const provider = createZeroDbProvider({ db: client.db });
    const order = [
      items[2]?.attachmentId,
      items[0]?.attachmentId,
      items[1]?.attachmentId,
    ].filter((id) => id !== undefined);
    const moved = order[0];
    if (!moved) throw new Error("Missing picture");
    await provider.transaction((tx) =>
      mutators.workouts.reorderExerciseMedia.fn({
        tx,
        ctx: { userId },
        args: {
          householdId,
          exerciseId,
          attachmentId: moved,
          orderedAttachmentIds: order,
          optimisticTimestamp: 1,
        },
      }),
    );
    const synced = await provider.run(
      queries.workouts.exerciseMedia.fn({
        args: { householdId, exerciseId },
        ctx: { userId },
      }),
    );
    expect(synced.map((row) => row.id)).toEqual(order);
    const [all] = await client.db
      .select()
      .from(exerciseMedia)
      .where(eq(exerciseMedia.id, items[3]?.attachmentId ?? ""));
    expect(all).toBeDefined(); // The unconfirmed upload is retained, not dropped by reorder.
  });
  it("serializes reorders with uploads and batched reads without deadlocking", async () => {
    const first = await pending(),
      second = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: first.attachmentId,
    });
    await services().confirmUpload({
      ...scope(),
      attachmentId: second.attachmentId,
    });
    const provider = createZeroDbProvider({ db: client.db });
    for (let i = 0; i < 4; i++) {
      const order =
        i % 2
          ? [first.attachmentId, second.attachmentId]
          : [second.attachmentId, first.attachmentId];
      const moved = order[0];
      if (!moved) throw new Error("Missing picture");
      const [, reads] = await Promise.all([
        provider.transaction((tx) =>
          mutators.workouts.reorderExerciseMedia.fn({
            tx,
            ctx: { userId },
            args: {
              householdId,
              exerciseId,
              attachmentId: moved,
              orderedAttachmentIds: order,
              optimisticTimestamp: 1,
            },
          }),
        ),
        services().readUrls({
          userId,
          householdId,
          requests: order.map((attachmentId) => ({
            exerciseId,
            attachmentId,
            variant: "thumbnail" as const,
          })),
        }),
        upload(),
      ]);
      expect(reads.kind).toBe("success");
    }
  }, 15000);
  it("shares catalog media across workout slots and preserves it after rename/slot removal", async () => {
    const workoutIds = [randomUUID(), randomUUID()];
    await client.db.insert(workouts).values(
      workoutIds.map((id) => ({
        id,
        householdId,
        title: "Exercise media test",
      })),
    );
    await client.db.insert(workoutExercises).values(
      workoutIds.map((workoutId) => ({
        id: randomUUID(),
        householdId,
        workoutId,
        exerciseId,
        sets: 3,
        target: "10",
        sortKey: 0,
      })),
    );
    const result = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });
    await client.db
      .update(exercises)
      .set({ name: "Press-up", normalizedName: "press-up" })
      .where(eq(exercises.id, exerciseId));
    await client.db
      .delete(workoutExercises)
      .where(eq(workoutExercises.exerciseId, exerciseId));
    expect(await read(result.attachmentId)).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: result.attachmentId }],
    });
    expect(
      await client.db
        .select()
        .from(exerciseMedia)
        .where(eq(exerciseMedia.exerciseId, exerciseId)),
    ).toHaveLength(1);
  });
  it("serializes concurrent uploads and rolls back both records if signing fails", async () => {
    const results = await Promise.all([upload(), upload()]);
    expect(results.every((r) => r.kind === "success")).toBe(true);
    const rows = await client.db
      .select()
      .from(exerciseMedia)
      .where(eq(exerciseMedia.exerciseId, exerciseId));
    expect(rows.map((r) => r.sortKey).sort((a, b) => b - a)).toEqual([
      0, -1024,
    ]);
    signUpload.mockRejectedValueOnce(new Error("Signing unavailable"));
    await expect(upload()).rejects.toThrow();
    expect(
      await client.db
        .select()
        .from(exerciseMedia)
        .where(eq(exerciseMedia.exerciseId, exerciseId)),
    ).toHaveLength(2);
    expect(
      await client.db
        .select()
        .from(media)
        .where(eq(media.householdId, householdId)),
    ).toHaveLength(2);
  });
  it("omits foreign/mismatched attachments and deduplicates authorized batch requests", async () => {
    const result = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });
    const requests = [
      {
        exerciseId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        exerciseId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        exerciseId: foreignExerciseId,
        attachmentId: result.attachmentId,
        variant: "thumbnail" as const,
      },
      {
        exerciseId,
        attachmentId: randomUUID(),
        variant: "thumbnail" as const,
      },
    ];
    const batch = await services().readUrls({
      userId,
      householdId,
      requests,
    });
    expect(batch).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: result.attachmentId, exerciseId }],
    });
    if (batch.kind === "success") expect(batch.reads).toHaveLength(1);
    expect(signRead).toHaveBeenCalledOnce();
    expect(
      await services().confirmUpload({
        ...scope(),
        exerciseId: foreignExerciseId,
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "not_found" });
  });
  it("soft-deletes only the attachment, preserves shared bytes and prevents reconfirmation", async () => {
    const result = await pending();
    await services().confirmUpload({
      ...scope(),
      attachmentId: result.attachmentId,
    });
    const [attachment] = await client.db
      .select()
      .from(exerciseMedia)
      .where(eq(exerciseMedia.id, result.attachmentId));
    if (!attachment) throw new Error("Missing attachment");
    const otherId = randomUUID();
    await client.db.insert(exerciseMedia).values({
      id: otherId,
      householdId,
      exerciseId,
      mediaId: attachment.mediaId,
      sortKey: -1024,
    });
    expect(
      await services().deleteAttachment({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "success" });
    expect(
      await services().deleteAttachment({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "success" });
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
    expect(await read(otherId)).toMatchObject({
      kind: "success",
      reads: [{ attachmentId: otherId }],
    });
    const [asset] = await client.db
      .select()
      .from(media)
      .where(eq(media.id, attachment.mediaId));
    expect(asset?.deletedAt).toBeNull();
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "not_found" });
  });
  it("rejects unsupported bytes, unavailable objects and processing failures without confirmation", async () => {
    const result = await pending();
    processImage.mockRejectedValueOnce(new InvalidMediaUploadError());
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    inspectObject.mockResolvedValueOnce({
      contentType: "image/png",
      byteSize: 43,
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "invalid_upload" });
    processImage.mockRejectedValueOnce(new Error("Worker unavailable"));
    await expect(
      services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).rejects.toThrow();
    expect(await read(result.attachmentId)).toEqual({
      kind: "success",
      reads: [],
    });
  });
  it("enforces household-scoped asset and exercise foreign keys", async () => {
    const result = await pending();
    const [attachment] = await client.db
      .select()
      .from(exerciseMedia)
      .where(eq(exerciseMedia.id, result.attachmentId));
    if (!attachment) throw new Error("Missing attachment");
    for (const target of [
      { householdId, exerciseId: foreignExerciseId },
      { householdId: foreignHouseholdId, exerciseId: foreignExerciseId },
    ]) {
      await expect(
        client.db.insert(exerciseMedia).values({
          id: randomUUID(),
          ...target,
          mediaId: attachment.mediaId,
          sortKey: 0,
        }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
    }
  });
  it("reauthorizes after processing before confirming when membership is revoked", async () => {
    const result = await pending();
    processImage.mockImplementationOnce(async () => {
      await client.db
        .delete(householdMembers)
        .where(eq(householdMembers.householdId, householdId));
    });
    expect(
      await services().confirmUpload({
        ...scope(),
        attachmentId: result.attachmentId,
      }),
    ).toEqual({ kind: "forbidden" });
    const rows = await client.db
      .select()
      .from(media)
      .where(eq(media.householdId, householdId));
    expect(rows.every((r) => r.confirmedAt === null)).toBe(true);
  });
  it("fails closed for deleted exercises, disabled modules and foreign households", async () => {
    await client.db
      .update(exercises)
      .set({ deletedAt: new Date() })
      .where(eq(exercises.id, exerciseId));
    expect(await upload()).toEqual({ kind: "not_found" });
    await client.db
      .update(exercises)
      .set({ deletedAt: null })
      .where(eq(exercises.id, exerciseId));
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(
        and(
          eq(householdModuleSettings.householdId, householdId),
          eq(householdModuleSettings.moduleKey, "workouts"),
        ),
      );
    expect(await upload()).toEqual({ kind: "forbidden" });
    expect(
      await services().readUrls({
        userId,
        householdId: foreignHouseholdId,
        requests: [
          {
            exerciseId: foreignExerciseId,
            attachmentId: randomUUID(),
            variant: "thumbnail",
          },
        ],
      }),
    ).toEqual({ kind: "forbidden" });
    expect(signRead).not.toHaveBeenCalled();
    expect(signUpload).not.toHaveBeenCalled();
  });
});
