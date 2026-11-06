import { fileURLToPath } from "node:url";
import {
  diagnosticFieldsSchema,
  diagnosticMessages,
} from "@home-hub/shared/diagnostics";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  diagnosticContext,
  diagnosticFor,
  diagnosticLocations,
  safeErrorType,
  withDiagnosticOperation,
} from "./diagnostics";
import {
  installApiObservability,
  type ObservabilityEnv,
  type StructuredLogRecord,
} from "./observability";

const secret =
  "PRIVATE_NOTE password=secret https://private.invalid/?signature=TOKEN";

const source = fileURLToPath(new URL("./app.ts", import.meta.url));

function unknownError() {
  const error = new Error(secret);
  error.name = "PrivateUserName";
  error.stack = `${secret}\n    at PrivateFunction (${source}:1:1)\n    at x (/home/private-user/secret.ts:2:2)\n    at y (${source}?signature=PRIVATE:1:1)\n    at z (file://${source}#PRIVATE:1:1)`;

  return error;
}

describe("source-first diagnostics", () => {
  it("preserves useful locations for unfamiliar exceptions without parsing their message", () => {
    const d = diagnosticFor("documents.storage_read", unknownError());
    expect(d).toEqual({
      errorCode: "HH_UNEXPECTED",
      operation: "documents.storage_read",
      diagnosticMessage: diagnosticMessages.HH_UNEXPECTED,
      locations: ["apps/api/src/app.ts:1:1"],
    });
    expect(diagnosticFieldsSchema.safeParse(d).success).toBe(true);
    expect(JSON.stringify(d)).not.toContain("PRIVATE");
    expect(safeErrorType(unknownError())).toBe("Error");
  });
  it.each([
    ["23505", "HH_DATABASE_CONSTRAINT"],
    ["23514", "HH_DATABASE_CONSTRAINT"],
    ["40001", "HH_DATABASE_RETRY"],
    ["40P01", "HH_DATABASE_RETRY"],
    ["08006", "HH_DATABASE_UNAVAILABLE"],
    ["57P01", "HH_DATABASE_UNAVAILABLE"],
    ["42P01", "HH_DATABASE_FAILURE"],
  ])(
    "classifies structured SQLSTATE %s, never SQL/details/values",
    (code, expected) => {
      const cause = Object.assign(new Error(secret), {
        code,
        detail: secret,
        query: secret,
      });
      const d = diagnosticFor("zero.transaction", new Error(secret, { cause }));
      expect(d.errorCode).toBe(expected);
      expect(d.code).toBe(code);
      expect(JSON.stringify(d)).not.toContain("PRIVATE");
    },
  );
  it("retains known timeout and connection semantics without trusting arbitrary error fields", () => {
    expect(
      diagnosticFor(
        "documents.storage_read",
        Object.assign(new Error(secret), { code: "ETIMEDOUT" }),
      ).errorCode,
    ).toBe("HH_DEPENDENCY_TIMEOUT");
    expect(
      diagnosticFor(
        "database.readiness",
        Object.assign(new Error(secret), { code: "ECONNREFUSED" }),
      ).errorCode,
    ).toBe("HH_DATABASE_UNAVAILABLE");
    expect(
      diagnosticFor(
        "documents.storage_read",
        Object.assign(new Error(secret), { code: "ECONNREFUSED" }),
      ).errorCode,
    ).toBe("HH_DEPENDENCY_UNAVAILABLE");
    expect(
      diagnosticFor(
        "http.request",
        Object.assign(new Error(secret), {
          code: "ALICE",
          errorCode: secret,
          diagnosticMessage: secret,
        }),
      ).errorCode,
    ).toBe("HH_UNEXPECTED");
  });
  it("rejects fake locations, unknown files, dependency frames, function names and invalid bounds", () => {
    const error = new Error(secret);
    error.stack = `${secret}\n at a (${source}:999999:1)\n at b (${source}:1:9999)\n at c (/app/node_modules/private.ts:1:1)\n at d (/app/apps/api/src/my-private-note.ts:1:1)\n at e (${source}:0:1)`;
    expect(diagnosticLocations(error)).toEqual([]);
  });
  it("bounds cause traversal and tolerates cyclic/hostile error properties", () => {
    const e = unknownError();
    Object.defineProperty(e, "cause", { value: e });
    expect(diagnosticFor("http.request", e).locations).toHaveLength(1);

    const hostile = new Error();

    for (const key of ["stack", "name", "code", "cause"]) {
      Object.defineProperty(hostile, key, {
        get() {
          throw Error(secret);
        },
      });
    }

    expect(diagnosticFor("http.request", hostile).errorCode).toBe(
      "HH_UNEXPECTED",
    );
    expect(safeErrorType(hostile)).toBe("Error");
  });
  it("retains the deepest failed source operation without replacing the original exception", async () => {
    await diagnosticContext.run({}, async () => {
      const error = unknownError();
      await expect(
        withDiagnosticOperation("documents.confirm_upload", () =>
          withDiagnosticOperation("documents.storage_read", async () => {
            throw error;
          }),
        ),
      ).rejects.toBe(error);
      expect(diagnosticContext.getStore()?.failure?.operation).toBe(
        "documents.storage_read",
      );
    });
    expect(diagnosticContext.getStore()).toBeUndefined();
  });
  it("logs child-handled failures once and preserves private response semantics", async () => {
    const records: StructuredLogRecord[] = [];
    const app = new Hono<ObservabilityEnv>();
    const child = new Hono();
    installApiObservability(app, {
      logger: { info: (r) => records.push(r), error: (r) => records.push(r) },
    });
    child.onError((_e, c) => c.json({ error: "safe existing response" }, 503));
    child.post("/uploads/:fileId/confirm", () =>
      withDiagnosticOperation("documents.storage_read", async () => {
        throw unknownError();
      }),
    );
    app.route("/api/households/:householdId/documents", child);

    const r = await app.request(
      "/api/households/private/documents/uploads/private/confirm?signature=PRIVATE",
      { method: "POST" },
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "safe existing response" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      operation: "documents.storage_read",
      errorCode: "HH_UNEXPECTED",
      locations: ["apps/api/src/app.ts:1:1"],
    });
    expect(JSON.stringify(records)).not.toContain("PRIVATE");
    expect(JSON.stringify(records)).not.toContain("/private/");
  });
  it("does not misattribute a later unrelated exception to a recovered dependency failure", async () => {
    const records: StructuredLogRecord[] = [];
    const app = new Hono<ObservabilityEnv>();
    installApiObservability(app, {
      logger: { info: (r) => records.push(r), error: (r) => records.push(r) },
    });
    app.get("/api/health", async () => {
      await withDiagnosticOperation("documents.storage_read", async () => {
        throw unknownError();
      }).catch(() => {});

      throw new Error("Different private failure");
    });
    await app.request("/api/health");
    expect(records[0]).toMatchObject({
      status: 500,
      operation: "http.health",
      errorCode: "HH_UNEXPECTED",
    });
  });
  it("does not turn a recovered failure into an error on a successful response", async () => {
    const records: StructuredLogRecord[] = [];
    const app = new Hono<ObservabilityEnv>();
    installApiObservability(app, {
      logger: { info: (r) => records.push(r), error: (r) => records.push(r) },
    });
    app.get("/api/health", async (c) => {
      await withDiagnosticOperation("documents.storage_read", async () => {
        throw unknownError();
      }).catch(() => {});

      return c.json({ ok: true });
    });
    await app.request("/api/health");
    expect(records[0]).toMatchObject({ status: 200, operation: "http.health" });
    expect(records[0]).not.toHaveProperty("errorCode");
  });
});
