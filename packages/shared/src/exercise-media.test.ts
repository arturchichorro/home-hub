import { describe, expect, it } from "vitest";
import {
  createExerciseMediaUploadSchema,
  exerciseImagesFromRows,
  exerciseMediaReadRequestSchema,
  reorderExerciseMediaSchema,
} from "./exercise-media";
import { queries } from "./zero/queries";

describe("shared exercise media", () => {
  it("requires a unique bounded order containing the moved attachment", () => {
    const attachmentId = crypto.randomUUID();
    const input = {
      householdId: crypto.randomUUID(),
      exerciseId: crypto.randomUUID(),
      attachmentId,
      orderedAttachmentIds: [attachmentId],
      optimisticTimestamp: 1,
    };
    expect(reorderExerciseMediaSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { orderedAttachmentIds: [] },
      { orderedAttachmentIds: [attachmentId, attachmentId] },
      { orderedAttachmentIds: [crypto.randomUUID()] },
      { orderedAttachmentIds: Array(501).fill(attachmentId) },
      { workoutId: crypto.randomUUID() },
    ])
      expect(
        reorderExerciseMediaSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it("rejects videos, GIF and client-controlled storage identity", () => {
    for (const extra of [
      { contentType: "video/mp4" },
      { contentType: "image/gif" },
      { mediaId: crypto.randomUUID() },
      { objectKey: "arbitrary" },
    ]) {
      expect(
        createExerciseMediaUploadSchema.safeParse({
          contentType: "image/png",
          byteSize: 42,
          width: 1,
          height: 1,
          ...extra,
        }).success,
      ).toBe(false);
    }
    expect(
      exerciseMediaReadRequestSchema.safeParse({ requests: [] }).success,
    ).toBe(false);
  });
  it("has a household/module/active-catalog and confirmed-asset authorized query", () => {
    const householdId = crypto.randomUUID(),
      exerciseId = crypto.randomUUID(),
      userId = crypto.randomUUID();
    const query = queries.workouts.exerciseMedia.fn({
      args: { householdId, exerciseId },
      ctx: { userId },
    });
    const ast = (query as unknown as { ast: unknown }).ast;
    const json = JSON.stringify(ast);
    for (const required of [
      "exerciseMedia",
      "media",
      "exercises",
      "householdMembers",
      "householdModuleSettings",
      "workouts",
      householdId,
      exerciseId,
      userId,
      "confirmedAt",
      "deletedAt",
    ]) {
      expect(json).toContain(required);
    }
    expect(json).not.toContain("workoutLogs");
    expect(queries.workouts.exerciseMedia.queryName).toBe(
      "workouts.exerciseMedia",
    );
  });
  it("filters unsupported or pending assets and preserves attachment identity", () => {
    const row = {
      id: "attachment",
      mediaId: "asset",
      householdId: "household",
      exerciseId: "exercise",
      sortKey: 0,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const asset = {
      id: "asset",
      householdId: "household",
      kind: "image",
      contentType: "image/png",
      byteSize: 42,
      width: 640,
      height: 480,
      durationMs: null,
      animated: null,
      confirmedAt: 2,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 2,
    };
    expect(exerciseImagesFromRows([{ ...row, asset }])[0]).toMatchObject({
      id: "attachment",
      mediaId: "asset",
      width: 640,
    });
    expect(
      exerciseImagesFromRows([
        { ...row, asset: { ...asset, confirmedAt: null } },
        { ...row, asset: { ...asset, kind: "video" } },
        { ...row, deletedAt: 3, asset },
      ]),
    ).toEqual([]);
  });
});
