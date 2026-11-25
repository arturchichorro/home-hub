import { expect, it } from "vitest";
import {
  contactDetailSchema,
  contactFieldsSchema,
  detailHref,
  entryFieldsSchema,
  validBirthday,
} from "./contacts";
import { householdModuleKeys } from "./modules";
import { queries } from "./zero/queries";

const id = () => crypto.randomUUID();
it("replaces Logs rather than adding another active module", () => {
  expect(householdModuleKeys).toContain("contacts");
  expect(householdModuleKeys).not.toContain("logs");
  expect(queries).not.toHaveProperty("logs");
});
it("permits duplicate detail labels but not duplicate row identities", () => {
  const row = {
    id: id(),
    type: "phone" as const,
    label: "Phone",
    value: "+32 (0)12 34 56 ext 7",
  };
  expect(
    contactFieldsSchema.parse({
      name: "  Alice  Smith ",
      archived: false,
      details: [row, { ...row, id: id() }],
    }).name,
  ).toBe("Alice Smith");
  expect(
    contactFieldsSchema.safeParse({
      name: "Alice",
      archived: false,
      details: [row, row],
    }).success,
  ).toBe(false);
  expect(contactDetailSchema.safeParse({ ...row, value: "" }).success).toBe(
    false,
  );
});
it.each(["--02-29", "--05-23", "2000-02-29", "1993-05-23"])(
  "accepts birthday %s",
  (value) => {
    expect(validBirthday(value)).toBe(true);
  },
);
it.each([
  "0000-01-01",
  "1900-02-29",
  "--02-30",
  "--13-01",
  "23 May",
  "2026-01-01T00:00:00Z",
])("rejects invalid birthday %s", (value) => {
  expect(validBirthday(value)).toBe(false);
});
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "file:///etc/passwd",
  "not a link",
])("rejects unsafe link %s", (value) => {
  const row = { id: id(), type: "link" as const, label: "Website", value };
  expect(contactDetailSchema.safeParse(row).success).toBe(false);
  expect(detailHref(row)).toBeUndefined();
});
it("provides escaped email/phone actions and accepts only supported field types", () => {
  expect(
    detailHref({
      id: id(),
      type: "email",
      label: "Work",
      value: "a+b@example.com",
    }),
  ).toBe("mailto:a%2Bb%40example.com");
  expect(
    detailHref({
      id: id(),
      type: "phone",
      label: "Home",
      value: "+32 (123) 456",
    }),
  ).toBe("tel:+32123456");
  expect(
    contactDetailSchema.safeParse({
      id: id(),
      type: "reminder",
      label: "X",
      value: "Y",
    }).success,
  ).toBe(false);
});
it("does not build actions from incomplete phone or email drafts", () => {
  expect(
    detailHref({ id: id(), type: "phone", label: "Phone", value: "" }),
  ).toBeUndefined();
  expect(
    detailHref({ id: id(), type: "phone", label: "Phone", value: "+" }),
  ).toBeUndefined();
  expect(
    detailHref({ id: id(), type: "email", label: "Email", value: "a@" }),
  ).toBeUndefined();
  expect(
    detailHref({ id: id(), type: "email", label: "Email", value: "" }),
  ).toBeUndefined();
});
it("requires people, preserves note whitespace, bounds text and normalizes the person set", () => {
  const a = id();
  const b = id();
  expect(
    entryFieldsSchema.safeParse({
      entryOn: "2026-11-24",
      note: "",
      contactIds: [],
    }).success,
  ).toBe(false);
  expect(
    entryFieldsSchema.safeParse({
      entryOn: "2026-11-24",
      note: "",
      contactIds: [a, a],
    }).success,
  ).toBe(false);
  const note = "  First\n\nSecond  ";
  expect(
    entryFieldsSchema.parse({
      entryOn: "2026-11-24",
      note,
      contactIds: [b, a],
    }),
  ).toEqual({
    entryOn: "2026-11-24",
    note,
    contactIds: [a, b].sort(),
  });
  expect(
    entryFieldsSchema.safeParse({
      entryOn: "2026-02-30",
      note,
      contactIds: [a],
    }).success,
  ).toBe(false);
  expect(
    entryFieldsSchema.safeParse({
      entryOn: "2026-11-24",
      note: "a\0b",
      contactIds: [a],
    }).success,
  ).toBe(false);
});
it("keeps contact queries household-authorized and bounded, and hides pending/photo drafts", () => {
  const args = { householdId: id(), contactId: id() };
  const q = queries.contacts.history.fn({ ctx: { userId: id() }, args });
  const ast = (q as unknown as { ast: { limit: number; orderBy: unknown } })
    .ast;
  const source = JSON.stringify(ast);
  for (const s of [
    "householdMembers",
    "householdModuleSettings",
    "contacts",
    "published",
    "deletedAt",
  ]) {
    expect(source).toContain(s);
  }
  expect(ast.limit).toBe(21);
  expect(ast.orderBy).toEqual([
    ["entryOn", "desc"],
    ["createdAt", "desc"],
    ["id", "desc"],
  ]);
});
