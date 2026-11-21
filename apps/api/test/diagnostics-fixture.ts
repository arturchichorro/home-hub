// Synthetic fixture only: real source boundaries, no network or storage writes.
import { S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { createDocumentStorage } from "../src/documents/storage.ts";
import {
  installApiObservability,
  type ObservabilityEnv,
  type StructuredLogRecord,
} from "../src/observability.ts";

export async function sourceDiagnosticFixture(
  secret: string,
  requestId: string,
) {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://private.invalid",
    credentials: { accessKeyId: secret, secretAccessKey: secret },
  });
  Object.defineProperty(client, "send", {
    value: async () => {
      throw new TypeError(`Previously unseen failure: ${secret}`);
    },
  });

  const storage = createDocumentStorage({
    client,
    bucket: secret,
    baseUrl: "https://private.invalid",
    secret,
  });
  const records: StructuredLogRecord[] = [];
  const app = new Hono<ObservabilityEnv>();
  installApiObservability(app, {
    logger: { info: (r) => records.push(r), error: (r) => records.push(r) },
  });
  app.post("/api/zero/mutate", async (c) =>
    c.json(await storage.readUpload(secret, 1)),
  );

  try {
    const response = await app.request("/api/zero/mutate", {
      method: "POST",
      headers: { "X-Request-ID": requestId },
      body: secret,
    });

    if (
      response.status !== 500 ||
      records.length !== 1 ||
      JSON.stringify(records).includes(secret)
    ) {
      throw Error("Source fixture did not preserve safe failure evidence");
    }

    const record = records[0];

    if (!record) {
      throw Error("Missing source fixture record");
    }

    return record;
  } finally {
    client.destroy();
  }
}
