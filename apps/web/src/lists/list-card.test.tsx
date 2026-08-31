import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListCard, type ListCardData } from "./list-card";

vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: vi.fn(),
  useSortable: () => ({ ref: vi.fn(), handleRef: vi.fn(), isDragging: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    className,
  }: {
    children: ReactNode;
    params: { householdId: string; listId: string };
    className: string;
  }) => (
    <a
      href={`/households/${params.householdId}/lists/${params.listId}`}
      className={className}
    >
      {children}
    </a>
  ),
}));

const list: ListCardData = {
  id: "list-1",
  householdId: "household-1",
  name: "Groceries",
  items: [
    { id: "item-1", name: "Milk", status: "active" },
    { id: "item-2", name: "Bread", status: "crossed" },
  ],
};

describe("ListCard", () => {
  it("shows the title and read-only item statuses inside one navigation target", () => {
    const markup = renderToStaticMarkup(
      <ListCard list={list} index={0} disabled={false} />,
    );

    expect(markup).toContain('href="/households/household-1/lists/list-1"');
    expect(markup).toContain("Groceries</h2>");
    expect(markup).toContain("Active: ");
    expect(markup).toContain("Completed: ");
    expect(markup).toContain('class="truncate text-foreground">Milk');
    expect(markup).toContain('class="truncate text-muted line-through">Bread');
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("Reorder");
    expect(markup).not.toContain("Move");
  });

  it("keeps empty and disconnected lists openable without extra card content", () => {
    const markup = renderToStaticMarkup(
      <ListCard list={{ ...list, items: [] }} index={0} disabled />,
    );

    expect(markup).toContain("Groceries</h2>");
    expect(markup).toContain('href="/households/household-1/lists/list-1"');
    expect(markup).not.toContain("No items");
    expect(markup).not.toContain("aria-disabled");
  });
});
