import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";

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
