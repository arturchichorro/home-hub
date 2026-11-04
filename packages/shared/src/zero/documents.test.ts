import { describe, expect, it } from "vitest";
import { queries } from "./queries";
import { schema } from "./schema.gen";

const householdId = crypto.randomUUID(),
  ctx = { userId: crypto.randomUUID() };
describe("document sync boundaries", () => {
  it("never publishes storage keys or replacement preconditions", () => {
    expect(schema.tables.documentFiles.columns).not.toHaveProperty("objectKey");
    expect(schema.tables.documentFiles.columns).not.toHaveProperty(
      "expectedFileId",
    );
  });
  it("builds intersecting scoped filters without discarding relationship aliases", () => {
    const query = queries.documents.page.fn({
      ctx,
      args: {
        householdId,
        tagIds: [crypto.randomUUID(), crypto.randomUUID()],
        search: "policy",
        limit: 51,
      },
    });
    const ast = (query as unknown as { ast: unknown }).ast;
    expect(JSON.stringify(ast)).toContain('"limit":51');
    expect(JSON.stringify(ast)).toContain("documents");
    expect(JSON.stringify(ast)).toContain("members");
    expect(JSON.stringify(ast)).not.toContain("objectKey");
  });
});
