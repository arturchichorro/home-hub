import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import { ContactsError } from "./records";
import { createContactsRoutes } from "./routes";

function setup() {
  const secret = "fixture-secret-".repeat(5);
  const userId = randomUUID();
  const householdId = randomUUID();
  const contactId = randomUUID();
  const services = {
    readProfile: vi.fn(async () => null),
    readEntry: vi.fn(async () => null),
    writeProfile: vi.fn(),
    writeEntry: vi.fn(),
  };
  const app = new Hono();
  app.route(
    "/api/households/:householdId/contacts",
    createContactsRoutes({ jwtSecret: secret, services }),
  );
  const headers = {
    Authorization: `Bearer ${signAccessToken({ userId, jwtId: randomUUID(), secret })}`,
    "Content-Type": "application/json",
  };
  const path = `/api/households/${householdId}/contacts/profiles/${contactId}`;
  return { app, headers, services, householdId, contactId, userId, path };
}
it("requires authentication before reading or writing Contacts", async () => {
  const { app, path, services } = setup();
  expect((await app.request(path)).status).toBe(401);
  expect((await app.request(path, { method: "PUT", body: "{}" })).status).toBe(
    401,
  );
  expect(services.readProfile).not.toHaveBeenCalled();
});
it("validates typed details and server-owned scope, rejecting unexpected fields", async () => {
  const { app, path, services, headers } = setup();
  const body = {
    expectedVersion: null,
    writeId: randomUUID(),
    fields: {
      name: "Alice",
      archived: false,
      details: [
        {
          id: randomUUID(),
          type: "link",
          label: "Bad",
          value: "javascript:alert(1)",
        },
      ],
    },
  };
  expect(
    (
      await app.request(path, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      })
    ).status,
  ).toBe(400);
  expect(services.writeProfile).not.toHaveBeenCalled();
  expect(
    (
      await app.request(path, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...body, unexpected: true }),
      })
    ).status,
  ).toBe(400);
});
it("returns authorized current revisions on conflict but never raw internal error text", async () => {
  const { app, path, services, headers, contactId } = setup();
  const record = {
    id: contactId,
    version: 3,
    fields: { name: "Remote", details: [], archived: false },
  };
  services.writeProfile.mockRejectedValueOnce(
    new ContactsError(409, "Changed elsewhere", record),
  );
  const body = JSON.stringify({
    expectedVersion: 2,
    writeId: randomUUID(),
    fields: { name: "Mine", details: [], archived: false },
  });
  const conflict = await app.request(path, { method: "PUT", headers, body });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ record });
  services.writeProfile.mockRejectedValueOnce(
    new Error("DO_NOT_EXPORT_PRIVATE_TOKEN"),
  );
  const failed = await app.request(path, { method: "PUT", headers, body });
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("PRIVATE_TOKEN");
});
it("does not expose idempotency internals and makes all reads non-cacheable", async () => {
  const { app, path, services, headers, householdId, contactId, userId } =
    setup();
  const response = await app.request(path, { headers });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ record: null });
  expect(services.readProfile).toHaveBeenCalledWith({
    householdId,
    contactId,
    userId,
  });
});
