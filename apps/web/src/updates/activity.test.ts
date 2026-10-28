import { expect, it } from "vitest";
import { blockAppUpdate, hasUpdateBlockers } from "./activity";

it("keeps independent drafts/uploads protected until every blocker releases", () => {
  const draft = blockAppUpdate(),
    upload = blockAppUpdate();
  try {
    expect(hasUpdateBlockers()).toBe(true);
    draft();
    draft();
    expect(hasUpdateBlockers()).toBe(true);
    upload();
    expect(hasUpdateBlockers()).toBe(false);
  } finally {
    draft();
    upload();
  }
});
