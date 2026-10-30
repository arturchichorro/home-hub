import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ZeroConnectionStatus } from "./connection-status";
import { useZeroMutationEnabled } from "./use-zero-mutation-enabled";

const state = vi.hoisted(() => ({ name: "initializing", required: false }));
vi.mock("@rocicorp/zero/react", () => ({
  useConnectionState: () => ({ name: state.name }),
}));
vi.mock("../updates/state", () => ({
  useUpdateRequired: () => state.required,
}));

function MutationState() {
  return <span>{String(useZeroMutationEnabled())}</span>;
}
afterEach(() => {
  state.name = "initializing";
  state.required = false;
});
it("shows local initialization and blocks writes until storage is ready", () => {
  expect(renderToStaticMarkup(<ZeroConnectionStatus />)).toContain(
    "Loading local data",
  );
  expect(renderToStaticMarkup(<MutationState />)).toContain("false");
});
it.each(["connecting", "connected"])(
  "allows writes while %s unless an update is required",
  (name) => {
    state.name = name;
    expect(renderToStaticMarkup(<MutationState />)).toContain("true");
    state.required = true;
    expect(renderToStaticMarkup(<MutationState />)).toContain("false");
  },
);
it.each(["disconnected", "needs-auth", "error", "closed"])(
  "blocks writes while %s",
  (name) => {
    state.name = name;
    expect(renderToStaticMarkup(<MutationState />)).toContain("false");
  },
);
