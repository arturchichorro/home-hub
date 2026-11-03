import { S3Client } from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { createDocumentStorage } from "./storage";

it("presigns exact browser PUT length/type without an empty-payload checksum", async () => {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://fixture.invalid",
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
  });
  const storage = createDocumentStorage({
    client,
    bucket: "fixture",
    baseUrl: "https://files.invalid",
    secret: "fixture",
  });
  const u = new URL(await storage.signUpload("example", 123));
  expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe(
    "content-length;content-type;host",
  );
  expect(u.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  expect(u.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
  client.destroy();
});
