import { describe, expect, it } from "vitest";

import {
  addShoppingItemMutationSchema,
  createShoppingItemRequestSchema,
  setShoppingItemStatusMutationSchema,
  setShoppingItemStatusRequestSchema,
} from "./shopping";

describe("addShoppingItemMutationSchema", () => {
  const input = {
    itemId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
    householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    name: "Whole Milk",
    optimisticTimestamp: 1_786_000_000_000,
  };

  it("accepts a complete input and cleans the display name", () => {
    expect(
      addShoppingItemMutationSchema.parse({
        ...input,
        name: "  Ｗｈｏｌｅ   Milk  ",
      }),
    ).toEqual(input);
  });

  it.each(["itemId", "householdId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        addShoppingItemMutationSchema.safeParse({
          ...input,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it.each(["   ", "a".repeat(101)])("rejects the invalid name %j", (name) => {
    expect(
      addShoppingItemMutationSchema.safeParse({ ...input, name }).success,
    ).toBe(false);
  });

  it.each([-1, 1.5])(
    "rejects the invalid optimistic timestamp %s",
    (optimisticTimestamp) => {
      expect(
        addShoppingItemMutationSchema.safeParse({
          ...input,
          optimisticTimestamp,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects extra properties", () => {
    expect(
      addShoppingItemMutationSchema.safeParse({
        ...input,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});

describe("createShoppingItemRequestSchema", () => {
  it("returns a cleaned display name", () => {
    expect(
      createShoppingItemRequestSchema.parse({ name: "  Whole   Milk  " }),
    ).toEqual({ name: "Whole Milk" });
  });

  it("accepts a raw value longer than 100 characters when cleaning reduces it to at most 100", () => {
    const name = `  ${"a".repeat(100)}  `;
    expect(name.length).toBeGreaterThan(100);
    expect(createShoppingItemRequestSchema.parse({ name })).toEqual({
      name: "a".repeat(100),
    });
  });

  it("rejects whitespace-only input", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({ name: "   " }).success,
    ).toBe(false);
  });

  it("rejects a cleaned name of 101 characters", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({
        name: "a".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({
        name: "milk",
        unexpected: "value",
      }).success,
    ).toBe(false);
  });
});

describe("setShoppingItemStatusRequestSchema", () => {
  it.each(["active", "crossed", "archived"] as const)(
    "accepts the %s status",
    (status) => {
      expect(setShoppingItemStatusRequestSchema.parse({ status })).toEqual({
        status,
      });
    },
  );

  it("rejects an unknown status", () => {
    expect(
      setShoppingItemStatusRequestSchema.safeParse({ status: "deleted" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing status", () => {
    expect(setShoppingItemStatusRequestSchema.safeParse({}).success).toBe(
      false,
    );
  });

  it("rejects extra properties", () => {
    expect(
      setShoppingItemStatusRequestSchema.safeParse({
        status: "active",
        unexpected: "value",
      }).success,
    ).toBe(false);
  });
});

describe("setShoppingItemStatusMutationSchema", () => {
  const input = {
    householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    itemId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
    status: "crossed" as const,
    optimisticUpdatedAt: 1_786_000_000_000,
  };

  it("accepts a complete mutation input", () => {
    expect(setShoppingItemStatusMutationSchema.parse(input)).toEqual(input);
  });

  it.each(["householdId", "itemId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        setShoppingItemStatusMutationSchema.safeParse({
          ...input,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects an unknown status", () => {
    expect(
      setShoppingItemStatusMutationSchema.safeParse({
        ...input,
        status: "deleted",
      }).success,
    ).toBe(false);
  });

  it.each([-1, 1.5])(
    "rejects the invalid optimistic timestamp %s",
    (optimisticUpdatedAt) => {
      expect(
        setShoppingItemStatusMutationSchema.safeParse({
          ...input,
          optimisticUpdatedAt,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects extra properties", () => {
    expect(
      setShoppingItemStatusMutationSchema.safeParse({
        ...input,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});
