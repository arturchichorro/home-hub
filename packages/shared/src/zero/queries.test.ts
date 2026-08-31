import type { AST } from "@rocicorp/zero";
import { describe, expect, it } from "vitest";

import { queries } from "./queries";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";

function getAst(query: unknown): AST {
  return (query as { ast: AST }).ast;
}

function equalsCondition(column: string, value: string | boolean | null) {
  return {
    type: "simple",
    left: { type: "column", name: column },
    op: "=",
    right: { type: "literal", value },
  };
}

function moduleAccessCondition(moduleKey: "recipes" | "lists") {
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

describe("Lists queries", () => {
  it("previews only the first four current items in detail-list order", () => {
    const ast = getAst(
      queries.lists.byHousehold.fn({ args: { householdId }, ctx: { userId } }),
    );
    expect(ast.related).toMatchObject([
      {
        correlation: {
          parentField: ["householdId", "id"],
          childField: ["householdId", "listId"],
        },
        subquery: {
          table: "listItems",
          alias: "items",
          where: {
            type: "simple",
            left: { type: "column", name: "status" },
            op: "IN",
            right: { type: "literal", value: ["active", "crossed"] },
          },
          orderBy: [
            ["status", "asc"],
            ["sortKey", "desc"],
            ["id", "asc"],
          ],
          limit: 4,
        },
      },
    ]);
  });
  it("scopes the ordered library to household membership and enabled Lists", () => {
    expect(queries.lists.byHousehold.queryName).toBe("lists.byHousehold");
    expect(
      getAst(
        queries.lists.byHousehold.fn({
          args: { householdId },
          ctx: { userId },
        }),
      ),
    ).toMatchObject({
      table: "lists",
      orderBy: [
        ["sortKey", "desc"],
        ["id", "asc"],
      ],
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          {
            type: "simple",
            left: { type: "column", name: "deletedAt" },
            op: "IS",
            right: { type: "literal", value: null },
          },
          moduleAccessCondition("lists"),
        ],
      },
    });
  });
  it("returns one authorized list with items joined by household AND list ID", () => {
    expect(queries.lists.detail.queryName).toBe("lists.detail");
    expect(
      getAst(
        queries.lists.detail.fn({
          args: { householdId, listId: recipeId },
          ctx: { userId },
        }),
      ),
    ).toMatchObject({
      table: "lists",
      limit: 1,
      where: {
        type: "and",
        conditions: [
          equalsCondition("householdId", householdId),
          {
            type: "simple",
            left: { type: "column", name: "deletedAt" },
            op: "IS",
            right: { type: "literal", value: null },
          },
          moduleAccessCondition("lists"),
          equalsCondition("id", recipeId),
        ],
      },
      related: [
        {
          correlation: {
            parentField: ["householdId", "id"],
            childField: ["householdId", "listId"],
          },
          subquery: {
            table: "listItems",
            alias: "items",
            orderBy: [
              ["sortKey", "desc"],
              ["id", "asc"],
            ],
          },
        },
      ],
    });
  });
});

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
      related: [
        {
          correlation: {
            childField: ["householdId", "recipeId"],
            parentField: ["householdId", "id"],
          },
          subquery: {
            alias: "images",
            table: "recipeImages",
            limit: 1,
            where: {
              type: "simple",
              left: { type: "column", name: "confirmedAt" },
              op: "IS NOT",
              right: { type: "literal", value: null },
            },
            orderBy: [
              ["position", "asc"],
              ["id", "asc"],
            ],
          },
        },
        {
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
          subquery: {
            alias: "cookLogs",
            table: "recipeCookLogs",
            limit: 1,
            orderBy: [
              ["cookedAt", "desc"],
              ["id", "desc"],
            ],
          },
        },
      ],
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
        {
          correlation: {
            childField: ["householdId", "recipeId"],
            parentField: ["householdId", "id"],
          },
          subquery: {
            alias: "images",
            table: "recipeImages",
            where: {
              type: "simple",
              left: { type: "column", name: "confirmedAt" },
              op: "IS NOT",
              right: { type: "literal", value: null },
            },
            orderBy: [
              ["position", "asc"],
              ["id", "asc"],
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

it("does not register legacy Shopping queries", () => {
  expect(queries).not.toHaveProperty("shopping");
});
