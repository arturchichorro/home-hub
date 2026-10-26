import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StillImageContentType } from "@home-hub/shared/media";

export const mediaUploadUrlLifetimeSeconds = 300;

type SignMediaUploadInput = {
  client: S3Client;
  bucket: string;
  objectKey: string;
  contentType: StillImageContentType;
};

export function signMediaUpload({
  client,
  bucket,
  objectKey,
  contentType,
}: SignMediaUploadInput): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    {
      expiresIn: mediaUploadUrlLifetimeSeconds,
      signableHeaders: new Set(["content-type"]),
    },
  );
}
