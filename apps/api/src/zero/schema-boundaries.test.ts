import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generated Zero schema boundaries", () => {
  it("does not pull database-only tooling/config into filtered web builds", () => {
    const source = readFileSync(
      new URL(
        "../../../../packages/shared/src/zero/schema.gen.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*database[^"']*["']/);
    expect(source).not.toMatch(/from\s+["']drizzle-zero["']/);
  });
});
