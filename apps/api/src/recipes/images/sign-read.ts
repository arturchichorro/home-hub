import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const recipeImageReadUrlLifetimeSeconds = 300;

type SignRecipeImageReadInput = {
  client: S3Client;
  bucket: string;
  objectKey: string;
};

export function signRecipeImageRead({
  client,
  bucket,
  objectKey,
}: SignRecipeImageReadInput): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
    {
      expiresIn: recipeImageReadUrlLifetimeSeconds,
    },
  );
}
