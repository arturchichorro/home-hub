import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export type InspectR2ObjectResult = {
  contentType: string | undefined;
  byteSize: number | undefined;
};

export async function inspectR2Object({
  client,
  bucket,
  objectKey,
}: {
  client: S3Client;
  bucket: string;
  objectKey: string;
}): Promise<InspectR2ObjectResult | null> {
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
    );

    return {
      contentType: result.ContentType,
      byteSize: result.ContentLength,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    ) {
      return null;
    }

    throw error;
  }
}
