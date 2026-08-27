import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export async function deleteR2Object({
  client,
  bucket,
  objectKey,
}: {
  client: S3Client;
  bucket: string;
  objectKey: string;
}): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );
}

export async function deleteR2Objects({
  client,
  bucket,
  objectKeys,
}: {
  client: S3Client;
  bucket: string;
  objectKeys: string[];
}): Promise<void> {
  if (objectKeys.length === 0) return;
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objectKeys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}
