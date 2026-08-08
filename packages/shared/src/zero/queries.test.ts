import type { AST } from "@rocicorp/zero";
import { describe, expect, it } from "vitest";

import { queries } from "./queries";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";

function getAst(query: unknown): AST {
  return (query as { ast: AST }).ast;
}

function equalsCondition(column: string, value: string | boolean) {
  return {
    type: "simple",
    left: { type: "column", name: column },
    op: "=",
    right: { type: "literal", value },
  };
}

function moduleAccessCondition(moduleKey: "shopping" | "recipes") {
  return {
    type: "correlatedSubquery",
    op: "EXISTS",
    related: {
      subquery: {
        table: "households",
        where: {
          type: "and",
          conditions: [
            directMembershipCondition(),
            {
              type: "correlatedSubquery",
              op: "EXISTS",
              related: {
                subquery: {
                  table: "householdModuleSettings",
                  where: {
                    type: "and",
                    conditions: [
                      equalsCondition("moduleKey", moduleKey),
                      equalsCondition("enabled", true),
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
}

function membershipCondition() {
  return {
    type: "correlatedSubquery",
    op: "EXISTS",
    related: {
      subquery: {
        table: "households",
        where: {
          type: "correlatedSubquery",
          op: "EXISTS",
          related: {
            subquery: {
              table: "householdMembers",
              where: equalsCondition("userId", userId),
            },
          },
        },
      },
    },
  };
}

function directMembershipCondition() {
  return {
    type: "correlatedSubquery",
    op: "EXISTS",
    related: {
      subquery: {
        table: "householdMembers",
        where: equalsCondition("userId", userId),
      },
    },
  };
}

describe("household queries", () => {
  it("registers a stable name", () => {
    expect(queries.households.mine.queryName).toBe("households.mine");
  });

  it("returns authorized households and only the current user's membership", () => {
    const query = queries.households.mine.fn({
      args: {},
      ctx: { userId },
    });

    expect(getAst(query)).toMatchObject({
      table: "households",
      orderBy: [
        ["name", "asc"],
        ["id", "asc"],
      ],
      where: directMembershipCondition(),
      related: [
        {
          subquery: {
            alias: "members",
            table: "householdMembers",
            where: equalsCondition("userId", userId),
          },
        },
      ],
    });
  });
});

describe("recipe queries", () => {
  it("registers stable names", () => {
    expect(queries.recipes.byHousehold.queryName).toBe("recipes.byHousehold");
    expect(queries.recipes.detail.queryName).toBe("recipes.detail");
  });

  it("scopes the recipe list to an authorized household with deterministic ordering", () => {
    const query = queries.recipes.byHousehold.fn({
      args: { householdId },
      ctx: { userId },
    });

    expect(getAst(query)).toMatchObject({
      table: "recipes",
      orderBy: [
        ["title", "asc"],
        ["id", "asc"],
      ],
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          moduleAccessCondition("recipes"),
        ],
      },
    });
  });

  it("scopes recipe detail to the household and user and orders related rows", () => {
    const query = queries.recipes.detail.fn({
      args: { householdId, recipeId },
      ctx: { userId },
    });

    expect(getAst(query)).toMatchObject({
      table: "recipes",
      limit: 1,
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          equalsCondition("id", recipeId),
          moduleAccessCondition("recipes"),
        ],
      },
      related: [
        {
          correlation: {
            childField: ["householdId", "recipeId"],
            parentField: ["householdId", "id"],
          },
          subquery: {
            alias: "ingredients",
            table: "recipeIngredients",
            orderBy: [
              ["position", "asc"],
              ["id", "asc"],
            ],
          },
        },
        {
          correlation: {
            childField: ["householdId", "recipeId"],
            parentField: ["householdId", "id"],
          },
          subquery: {
            alias: "cookLogs",
            table: "recipeCookLogs",
            orderBy: [
              ["cookedAt", "desc"],
              ["id", "desc"],
            ],
          },
        },
      ],
    });
  });
});

describe("module settings queries", () => {
  it("scopes settings to an authorized household", () => {
    const query = queries.modules.byHousehold.fn({
      args: { householdId },
      ctx: { userId },
    });

    expect(getAst(query)).toMatchObject({
      table: "householdModuleSettings",
      orderBy: [["moduleKey", "asc"]],
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          membershipCondition(),
        ],
      },
    });
  });
});

describe("shopping queries", () => {
  it("requires membership and an enabled Shopping setting", () => {
    const query = queries.shopping.byHousehold.fn({
      args: { householdId },
      ctx: { userId },
    });

    expect(getAst(query)).toMatchObject({
      table: "shoppingItems",
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          moduleAccessCondition("shopping"),
        ],
      },
    });
  });
});
