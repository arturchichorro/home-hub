import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { deleteR2Object, deleteR2Objects } from "./delete-object";

const bucket = "home-hub-dev";
const objectKey =
  "households/d92e5c4e-1c68-4942-9cc9-710207661bca/recipes/8d46a4c4-4845-4a6d-a937-139633ae1bb9/5944cb0d-931a-4723-b981-77eacb122314";

describe("deleteR2Object", () => {
  it("deletes the server-selected bucket object", async () => {
    let command: unknown;
    const client = {
      send: vi.fn(async (input: unknown) => {
        command = input;
        return {};
      }),
    } as unknown as S3Client;

    await expect(
      deleteR2Object({ client, bucket, objectKey }),
    ).resolves.toBeUndefined();

    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({
      Bucket: bucket,
      Key: objectKey,
    });
  });
});

describe("deleteR2Objects", () => {
  it("deletes the original and derivatives in one request", async () => {
    let command: unknown;
    const client = {
      send: vi.fn(async (input: unknown) => {
        command = input;
        return {};
      }),
    } as unknown as S3Client;
    const objectKeys = [objectKey, `${objectKey}/derivatives/thumbnail.webp`];

    await deleteR2Objects({ client, bucket, objectKeys });

    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect((command as DeleteObjectsCommand).input).toEqual({
      Bucket: bucket,
      Delete: {
        Objects: objectKeys.map((Key) => ({ Key })),
        Quiet: true,
      },
    });
  });
});
