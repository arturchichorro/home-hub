import { afterEach, describe, expect, it, vi } from "vitest";
import { createDbClient } from "./client";
import { withPublicSearchPath } from "./connection-url";

vi.mock("dotenv", () => ({ config: vi.fn() }));

const databaseUrl = "postgres://home_hub:test@localhost:5432/home_hub";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public database search path", () => {
  it("sets public for connections without explicit options", () => {
    const url = new URL(withPublicSearchPath(databaseUrl));

    expect(url.searchParams.get("options")).toBe("-c search_path=public");
  });

  it("preserves credentials and unrelated connection parameters", () => {
    const original = new URL(
      "postgresql://home_hub:p%40ss%2Fword@localhost:5433/home_hub?sslmode=require&application_name=migrate",
    );
    const url = new URL(withPublicSearchPath(original.toString()));

    expect(url.protocol).toBe(original.protocol);
    expect(url.username).toBe(original.username);
    expect(url.password).toBe(original.password);
    expect(url.host).toBe(original.host);
    expect(url.pathname).toBe(original.pathname);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("application_name")).toBe("migrate");
  });

  it("preserves other startup options but overrides a conflicting search path", () => {
    const original = new URL(databaseUrl);
    original.searchParams.set(
      "options",
      "-c statement_timeout=5000 -c search_path=home_hub,public",
    );

    const url = new URL(withPublicSearchPath(original.toString()));

    expect(url.searchParams.get("options")).toBe(
      "-c statement_timeout=5000 -c search_path=home_hub,public -c search_path=public",
    );
  });

  it("uses the policy for the application pool without connecting", async () => {
    const { db, close } = createDbClient(databaseUrl);

    try {
      expect(db.$client.options.connectionString).toBe(
        withPublicSearchPath(databaseUrl),
      );
    } finally {
      await close();
    }
  });

  it("uses the same policy for Drizzle migrations", async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    const { default: config } = await import("../drizzle.config");

    expect(config).toMatchObject({
      dbCredentials: { url: withPublicSearchPath(databaseUrl) },
    });
  });
});
