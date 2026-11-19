import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSessionProvider } from "../media/session";
import { CalendarMedia } from "./calendar-media";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@rocicorp/zero/react", () => ({
  useQuery,

  useZero: () => ({ mutate: vi.fn() }),
}));

vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));

const householdId = crypto.randomUUID();

const itemId = crypto.randomUUID();

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
    itemId,
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

function render(disabled = false, saved = true, authenticated = true) {
  const content = (
    <CalendarMedia
      householdId={householdId}
      itemId={itemId}
      name="Dinner"
      disabled={disabled}
      saved={saved}
      onBusyChange={() => {}}
    >
      {({ upload, gallery }) => (
        <div>
          {upload}
          {gallery}
        </div>
      )}
    </CalendarMedia>
  );
  return renderToStaticMarkup(
    authenticated ? (
      <MediaSessionProvider value={session}>{content}</MediaSessionProvider>
    ) : (
      content
    ),
  );
}

describe("calendar pictures", () => {
  it("matches the cook-log strip with 48px thumbnails and a compact upload action", () => {
    const html = render();
    expect(html).toContain('aria-label="Pictures for Dinner"');
    expect(html).toContain('aria-label="Open picture for Dinner"');
    expect(html).toContain('aria-label="Add picture for Dinner"');
    expect(html).toContain("size-12");
    expect(html).toContain("size-7!");
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("Drag to reorder");
  });
  it("keeps pictures viewable while writes are disabled", () => {
    const html = render(true);
    expect(html).toContain('aria-label="Open picture for Dinner"');
    expect(
      html.match(/<button[^>]*aria-label="Add picture for Dinner"[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
  it("does not allow uploads before the first saved title", () => {
    expect(render(false, false)).toContain(
      "Name the item before adding a picture",
    );
    expect(
      render(false, false).match(
        /<button[^>]*aria-label="Add picture for Dinner"[^>]*>/,
      )?.[0],
    ).toContain('disabled=""');
  });
  it("does not load media outside an authenticated session", () => {
    useQuery.mockClear();
    expect(render(false, true, false)).toBe("<div></div>");
    expect(useQuery).not.toHaveBeenCalled();
  });
  it("hides unconfirmed, deleted and non-image assets", () => {
    const row = imageRow();
    useQuery.mockReturnValue([
      [
        { ...row, asset: { ...row.asset, confirmedAt: null } },
        { ...row, deletedAt: 1 },
        { ...row, asset: { ...row.asset, kind: "video" } },
      ],
      { type: "complete" },
    ]);
    expect(render()).not.toContain('aria-label="Pictures for Dinner"');
  });
});
