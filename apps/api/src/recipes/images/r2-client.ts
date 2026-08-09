import { S3Client } from "@aws-sdk/client-s3";

export type CreateR2ClientInput = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createR2Client({
  endpoint,
  accessKeyId,
  secretAccessKey,
}: CreateR2ClientInput): S3Client {
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}
