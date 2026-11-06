import { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { signDocumentRead } from "@home-hub/shared/document-delivery";
import { documentMaxBytes } from "@home-hub/shared/documents";
import type { DocumentStorage } from "./service";
import { InvalidDocumentFileError } from "./validate-file";

export function createDocumentStorage({
  client,
  bucket,
  baseUrl,
  secret,
}: {
  client: S3Client;
  bucket: string;
  baseUrl: string;
  secret: string;
}): DocumentStorage {
  // Presigning has no body: do not sign an automatically generated checksum of
  // an empty payload. Limit this supported SDK setting to document PUT URLs.
  const uploadClient = new S3Client({
    region: client.config.region,
    credentials: client.config.credentials,
    forcePathStyle: client.config.forcePathStyle,
    ...(client.config.endpoint ? { endpoint: client.config.endpoint } : {}),
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  return {
    signUpload: (key, byteSize) =>
      getSignedUrl(
        uploadClient,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: "application/octet-stream",
          ContentLength: byteSize,
        }),
        {
          expiresIn: 300,
          signableHeaders: new Set(["content-type", "content-length"]),
        },
      ),

    async readUpload(key, expectedBytes) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      const body = response.Body;

      if (!(body instanceof Readable)) {
        throw new InvalidDocumentFileError();
      }

      if (
        response.ContentLength !== expectedBytes ||
        expectedBytes > documentMaxBytes
      ) {
        body.destroy();

        throw new InvalidDocumentFileError();
      }

      // Explicitly bound the stream even if a storage implementation misreports its length.
      const bytes = new Uint8Array(expectedBytes);
      let offset = 0;

      try {
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
          if (offset + chunk.length > bytes.length) {
            throw new InvalidDocumentFileError();
          }

          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } finally {
        body.destroy();
      }

      if (offset !== expectedBytes) {
        throw new InvalidDocumentFileError();
      }

      return bytes;
    },

    async putVerified(key, data, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    },

    async signRead(cap) {
      const url = new URL("/documents/files", baseUrl);
      url.searchParams.set("capability", JSON.stringify(cap));
      url.searchParams.set("signature", await signDocumentRead(cap, secret));

      return url.toString();
    },
  };
}
