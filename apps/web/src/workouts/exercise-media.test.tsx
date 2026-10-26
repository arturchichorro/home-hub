import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSessionProvider } from "../media/session";
import { ExerciseMedia } from "./exercise-media";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({ useQuery }));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
const householdId = crypto.randomUUID(),
  exerciseId = crypto.randomUUID();
const session = {
  accessToken: "test",
  userId: crypto.randomUUID(),
  onSessionExpired: vi.fn(),
};
beforeEach(() => {
  useQuery.mockReturnValue([
    [
      {
        id: crypto.randomUUID(),
        householdId,
        exerciseId,
        mediaId: crypto.randomUUID(),
        sortKey: 0,
        deletedAt: null,
        createdAt: 0,
        updatedAt: 0,
        asset: {
          id: crypto.randomUUID(),
          householdId,
          kind: "image",
          contentType: "image/png",
          byteSize: 42,
          width: 640,
          height: 480,
          animated: null,
          durationMs: null,
          confirmedAt: 1,
          deletedAt: null,
          createdAt: 0,
          updatedAt: 1,
        },
      },
    ],
    { type: "complete" },
  ]);
});
describe("inline exercise media", () => {
  it("shows a compact cooking-log-style strip with an upload action", () => {
    const html = renderToStaticMarkup(
      <MediaSessionProvider value={session}>
        <ExerciseMedia
          householdId={householdId}
          exerciseId={exerciseId}
          name="Push-up"
        />
      </MediaSessionProvider>,
    );
    expect(html).toContain('aria-label="Pictures for Push-up"');
    expect(html).toContain('aria-label="Open picture for Push-up"');
    expect(html).toContain('aria-label="Add picture for Push-up"');
    expect(html).toContain("size-12");
  });
  it("keeps reference pictures viewable while logging without shared editing controls", () => {
    const html = renderToStaticMarkup(
      <MediaSessionProvider value={session}>
        <ExerciseMedia
          householdId={householdId}
          exerciseId={exerciseId}
          name="Push-up"
          readOnly
        />
      </MediaSessionProvider>,
    );
    expect(html).toContain('aria-label="Open picture for Push-up"');
    expect(html).not.toContain('aria-label="Add picture for Push-up"');
  });
  it("does not attempt media requests outside an authenticated session", () => {
    useQuery.mockClear();
    expect(
      renderToStaticMarkup(
        <ExerciseMedia
          householdId={householdId}
          exerciseId={exerciseId}
          name="Push-up"
        />,
      ),
    ).toBe("");
    expect(useQuery).not.toHaveBeenCalled();
  });
});
