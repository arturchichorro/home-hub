import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HabitDetailPage } from "./habit-detail";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery: mocks.useQuery,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ status: "idle" }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function render(archived = false, person?: string) {
  mocks.useQuery
    .mockReturnValueOnce([
      [
        { userId: "me", user: { username: "Me" } },
        { userId: "peer", user: { username: "Peer" } },
      ],
      { type: "complete" },
    ])
    .mockReturnValueOnce([
      {
        id: "habit",
        name: "Read",
        status: archived ? "archived" : "active",
        note: "Saved shared instructions",
        workoutMode: "none",
      },
      { type: "complete" },
    ])
    .mockReturnValueOnce([
      [
        {
          entries: [
            {
              userId: person ?? "me",
              entryOn: "2026-11-10",
              completed: false,
              note: "Saved daily note",
            },
          ],
        },
      ],
      { type: "complete" },
    ]);
  return renderToStaticMarkup(
    <HabitDetailPage
      householdId="10000000-0000-4000-8000-000000000001"
      habitId="30000000-0000-4000-8000-000000000900"
      person={person}
    />,
  );
}
it("opens today's direct editor with one month and existing shared/daily text", () => {
  const html = render();
  expect(html.match(/<table/g)).toHaveLength(1);
  expect(html).toContain("Details for Read on 2026-11-10");
  expect(html.indexOf("Details for Read")).toBeLessThan(html.indexOf("<table"));
  expect(html).toContain("Saved shared instructions");
  expect(html).toContain("Saved daily note");
  expect(html).not.toContain("statistics");
});
it("inspects another member's day without editing their note/completion, while shared management stays shared", () => {
  const html = render(false, "peer");
  expect(html).toContain("Saved daily note");
  expect(html).not.toContain("Mark done");
  expect(html).not.toContain('aria-label="Note for Read on');
  expect(html).toContain('aria-label="Note for Read"');
});
it("retains archived stored text without statistics or active editing", () => {
  const html = render(true);
  expect(html).not.toContain("Completed days");
  expect(html).not.toContain("Current weekly streak");
  expect(html).not.toMatch(/<textarea|Mark done|Clear completion/);
  expect(html).toContain("Saved shared instructions");
  expect(html).toContain("Saved daily note");
});
