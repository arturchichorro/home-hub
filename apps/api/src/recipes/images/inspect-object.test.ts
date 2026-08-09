import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { inspectR2Object } from "./inspect-object";

const bucket = "home-hub-dev";
const objectKey = "households/household-id/recipes/recipe-id/image-id";

function createClient(send: (command: unknown) => Promise<unknown>) {
  return { send: vi.fn(send) } as unknown as S3Client;
}

describe("inspectR2Object", () => {
  it("returns the object metadata needed for confirmation", async () => {
    const client = createClient(async () => ({
      ContentType: "image/webp",
      ContentLength: 2_048,
    }));

    await expect(
      inspectR2Object({ client, bucket, objectKey }),
    ).resolves.toEqual({ contentType: "image/webp", byteSize: 2_048 });

    const send = client.send as ReturnType<typeof vi.fn>;
    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect((command as HeadObjectCommand).input).toEqual({
      Bucket: bucket,
      Key: objectKey,
    });
  });

  it("returns null when R2 reports that the object does not exist", async () => {
    const client = createClient(async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    });

    await expect(
      inspectR2Object({ client, bucket, objectKey }),
    ).resolves.toBeNull();
  });

  it("does not hide authorization or infrastructure failures", async () => {
    const error = Object.assign(new Error("R2 unavailable"), {
      $metadata: { httpStatusCode: 503 },
    });
    const client = createClient(async () => {
      throw error;
    });

    await expect(inspectR2Object({ client, bucket, objectKey })).rejects.toBe(
      error,
    );
  });
});
