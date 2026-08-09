import { describe, expect, it } from "vitest";

import { createR2Client } from "./r2-client";
import {
  recipeImageReadUrlLifetimeSeconds,
  signRecipeImageRead,
} from "./sign-read";

const accessKeyId = "test-access-key-id";
const secretAccessKey = "test-secret-access-key";
const bucket = "home-hub-dev";
const objectKey =
  "households/d92e5c4e-1c68-4942-9cc9-710207661bca/recipes/8d46a4c4-4845-4a6d-a937-139633ae1bb9/5944cb0d-931a-4723-b981-77eacb122314";

describe("signRecipeImageRead", () => {
  it("targets one object with a short-lived GET URL", async () => {
    const client = createR2Client({
      endpoint: "https://example-account.r2.cloudflarestorage.com",
      accessKeyId,
      secretAccessKey,
    });

    try {
      const signedUrl = await signRecipeImageRead({
        client,
        bucket,
        objectKey,
      });
      const url = new URL(signedUrl);

      expect(url.searchParams.get("X-Amz-Expires")).toBe(
        String(recipeImageReadUrlLifetimeSeconds),
      );
      expect(
        url.searchParams.get("X-Amz-SignedHeaders")?.split(";"),
      ).not.toContain("content-type");
      expect(`${url.hostname}${url.pathname}`).toContain(bucket);
      expect(decodeURIComponent(url.pathname)).toContain(objectKey);
      expect(signedUrl).not.toContain(secretAccessKey);
    } finally {
      client.destroy();
    }
  });
});
