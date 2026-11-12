import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSessionProvider } from "../media/session";
import { ExerciseMedia } from "./exercise-media";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@rocicorp/zero/react", () => ({
  useQuery,

  useZero: () => ({ mutate: vi.fn() }),
}));

vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));

const householdId = crypto.randomUUID();

const exerciseId = crypto.randomUUID();

const session = {
  accessToken: "test",
  userId: crypto.randomUUID(),
  onSessionExpired: vi.fn(),
};

function imageRow(sortKey = 0) {
  const mediaId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    householdId,
    exerciseId,
    mediaId,
    sortKey,
    deletedAt: null,
    createdAt: 0,
    updatedAt: 0,
    asset: {
      id: mediaId,
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
  };
}

beforeEach(() => {
  useQuery.mockReturnValue([[imageRow()], { type: "complete" }]);
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
    expect(html).toContain("Drag to reorder, or press Space and arrow keys");
    expect(html).toContain('draggable="false"');
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
    expect(html).not.toContain("Drag to reorder");
  });
  it("shows every leading thumbnail without scroll-only overflow or disabled drag semantics in read mode", () => {
    useQuery.mockReturnValue([
      Array.from({ length: 4 }, (_, index) => imageRow(index)),
      { type: "complete" },
    ]);
    const html = renderToStaticMarkup(
      <MediaSessionProvider value={session}>
        <ExerciseMedia
          householdId={householdId}
          exerciseId={exerciseId}
          name="Photos"
          leading
          readOnly
        />
      </MediaSessionProvider>,
    );
    expect(html.match(/data-exercise-media-attachment-id=/g)).toHaveLength(4);
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('aria-roledescription="draggable"');
    expect(html).not.toContain('type="file"');
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
