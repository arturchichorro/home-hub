import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuestAccessContext } from "../guest-access/context";
import { useZeroMutationEnabled } from "./use-zero-mutation-enabled";

const state = vi.hoisted(() => ({ name: "connected" }));
vi.mock("@rocicorp/zero/react", () => ({ useConnectionState: () => state }));
function Control() {
  return (
    <button type="button" disabled={!useZeroMutationEnabled()}>
      Edit
    </button>
  );
}
describe("shared module mutation controls", () => {
  it.each(["read", "write"] as const)("honors %s Guest access", (access) => {
    state.name = "connected";
    const html = renderToStaticMarkup(
      <GuestAccessContext.Provider
        value={{
          credential: "memory-only",
          guest: {
            id: "link",
            householdId: "home",
            access,
            expiresAt: Date.now() + 10000,
          },
        }}
      >
        <Control />
      </GuestAccessContext.Provider>,
    );
    expect(html.includes('disabled=""')).toBe(access === "read");
  });
  it("preserves account mutation controls", () => {
    state.name = "connected";
    expect(renderToStaticMarkup(<Control />)).not.toContain('disabled=""');
    state.name = "disconnected";
    expect(renderToStaticMarkup(<Control />)).toContain('disabled=""');
  });
});
