import type { ContactDetail } from "@home-hub/shared/contacts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ContactDetails } from "./contact-details";

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: () => false,
  useSortable: () => ({ ref: () => {}, handleRef: () => {} }),
}));
const id = () => crypto.randomUUID();
const render = (rows: ContactDetail[]) =>
  renderToStaticMarkup(
    <ContactDetails rows={rows} disabled={false} change={() => {}} />,
  );

it("chooses types only through the add actions, retaining labels and typed inputs without a dropdown", () => {
  const html = render([
    { id: id(), type: "phone", label: "Work", value: "+32 123" },
    { id: id(), type: "email", label: "Email", value: "a@example.com" },
    { id: id(), type: "birthday", label: "Birthday", value: "--05-23" },
  ]);
  expect(html).not.toContain("<select");
  expect(html).not.toContain("Type for");
  for (const label of ["Details", "Phone", "Email", "Link", "Birthday"]) {
    expect(html).toContain("+ " + label);
  }
  expect(html).toContain('type="tel"');
  expect(html).toContain('type="email"');
  expect(html).toContain('aria-label="Remove Work"');
  expect(html).toContain('aria-label="Birthday year (optional)"');
});
it("does not show call/email/open actions for empty or incomplete drafts", () => {
  const html = render([
    { id: id(), type: "phone", label: "Phone", value: "" },
    { id: id(), type: "email", label: "Email", value: "a@" },
    { id: id(), type: "link", label: "Link", value: "https://" },
  ]);
  expect(html).not.toContain("<a ");
  expect(html).toContain('placeholder="name@example.com"');
  expect(html).toContain('placeholder="https://example.com"');
});
it("keeps accessible row actions while a custom label is temporarily blank", () => {
  const html = render([{ id: id(), type: "phone", label: "", value: "123" }]);
  expect(html).toContain('aria-label="Reorder Phone"');
  expect(html).toContain('aria-label="Remove Phone"');
  expect(html).toContain('aria-label="Value for Phone"');
});
