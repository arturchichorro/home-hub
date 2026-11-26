import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ListItems } from "./list-items";

vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ mutate: vi.fn() }),
  useConnectionState: () => ({ name: "connected" }),
}));

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: vi.fn(), handleRef: vi.fn() }),
  isSortable: () => false,
}));

const fields = {
  householdId: "house",
  listId: "shopping",
  normalizedName: "item",
  createdAt: 0,
  updatedAt: 0,
};

it("contains checklist intrinsic widths in a zero-minimum grid track", () => {
  const markup = renderToStaticMarkup(
    <ListItems
      householdId="house"
      listId="shopping"
      items={[
        { ...fields, id: "bread", name: "Bread", status: "active", sortKey: 0 },
        {
          ...fields,
          id: "milk",
          name: "Oat milk",
          status: "crossed",
          sortKey: 1,
        },
      ]}
    />,
  );
  expect(markup).toContain("grid min-w-0 grid-cols-[minmax(0,1fr)]");
  expect(markup).toContain('aria-label="Archive Bread"');
  expect(markup).toContain('aria-label="Reactivate Oat milk"');
});
