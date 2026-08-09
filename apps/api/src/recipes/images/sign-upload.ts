import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RecipeImageContentType } from "@home-hub/shared/recipe-images";

export const recipeImageUploadUrlLifetimeSeconds = 300;

type SignRecipeImageUploadInput = {
  client: S3Client;
  bucket: string;
  objectKey: string;
  contentType: RecipeImageContentType;
};

export function signRecipeImageUpload({
  client,
  bucket,
  objectKey,
  contentType,
}: SignRecipeImageUploadInput): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    {
      expiresIn: recipeImageUploadUrlLifetimeSeconds,
      signableHeaders: new Set(["content-type"]),
    },
  );
}
