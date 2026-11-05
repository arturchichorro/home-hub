import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import { createDocumentRoutes } from "./routes";
import { DocumentServiceError, type DocumentServices } from "./service";

const secret = "document-route-isolated-test-secret";

const userId = crypto.randomUUID();

const householdId = crypto.randomUUID();

const token = signAccessToken({ userId, jwtId: crypto.randomUUID(), secret });

const services: DocumentServices = {
  createUpload: vi.fn(),
  confirm: vi.fn(),
  read: vi.fn(),
};

const app = new Hono().route(
  "/api/households/:householdId/documents",
  createDocumentRoutes({ jwtSecret: secret, services }),
);

function request(path: string, body: unknown, auth = true) {
  return app.request(`/api/households/${householdId}/documents${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("document routes", () => {
  it("requires authentication", async () =>
    expect((await request("/uploads", {}, false)).status).toBe(401));
  it("rejects unsupported formats before touching storage", async () =>
    expect(
      (await request("/uploads", { filename: "a.exe", byteSize: 2 })).status,
    ).toBe(400));
  it("passes the authenticated user and household, not caller identity", async () => {
    vi.mocked(services.createUpload).mockResolvedValueOnce({
      documentId: crypto.randomUUID(),
      fileId: crypto.randomUUID(),
      url: "https://upload.example/",
    });
    expect(
      (await request("/uploads", { filename: "a.pdf", byteSize: 20 })).status,
    ).toBe(201);
    expect(services.createUpload).toHaveBeenLastCalledWith({
      userId,
      householdId,
      filename: "a.pdf",
      byteSize: 20,
    });
  });
  it("maps domain failures and sanitizes SQL/storage exceptions", async () => {
    vi.mocked(services.confirm).mockRejectedValueOnce(
      new DocumentServiceError(403, "Forbidden"),
    );
    expect(
      (await request(`/uploads/${crypto.randomUUID()}/confirm`, {})).status,
    ).toBe(403);
    vi.mocked(services.confirm).mockRejectedValueOnce(
      Error("INSERT object_key=private-policy secret SQL"),
    );

    const r = await request(`/uploads/${crypto.randomUUID()}/confirm`, {});
    expect(r.status).toBe(503);
    expect(await r.text()).not.toMatch(/object_key|private-policy|SQL/u);
  });
});
