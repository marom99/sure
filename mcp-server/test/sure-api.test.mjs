import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTransactionsQuery,
  categoryIdSchema,
  fetchAllCategories,
  fetchCategoriesPage,
  findCategoryByName,
  resolveCategoryId,
} from "../src/sure-api.ts";

const apiKey = "test-api-key";

function createMockRequest(handler) {
  return async (path, passedApiKey, method = "GET", body) =>
    handler({ path, apiKey: passedApiKey, method, body });
}

test("fetchCategoriesPage returns category ids and names from the API response", async () => {
  const request = createMockRequest(({ path, apiKey: usedApiKey }) => {
    assert.equal(usedApiKey, apiKey);
    assert.equal(path, "/categories?page=1&per_page=2");

    return {
      categories: [
        { id: "cat-food", name: "Food & Drink", color: "#f97316", icon: "utensils", parent: null, subcategories_count: 0, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
        { id: "cat-groceries", name: "Groceries", color: "#407706", icon: "shopping-bag", parent: { id: "cat-food", name: "Food & Drink" }, subcategories_count: 0, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
      ],
      pagination: { page: 1, per_page: 2, total_count: 2, total_pages: 1 },
    };
  });

  const response = await fetchCategoriesPage(apiKey, request, {
    page: 1,
    per_page: 2,
  });

  assert.deepEqual(
    response.categories.map(({ id, name }) => ({ id, name })),
    [
      { id: "cat-food", name: "Food & Drink" },
      { id: "cat-groceries", name: "Groceries" },
    ]
  );
});

test("fetchAllCategories follows pagination when resolving categories", async () => {
  const seenPaths = [];
  const request = createMockRequest(({ path }) => {
    seenPaths.push(path);

    if (path === "/categories?page=1&per_page=100") {
      return {
        categories: [
          { id: "cat-food", name: "Food & Drink", color: "#f97316", icon: "utensils", parent: null, subcategories_count: 1, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
        ],
        pagination: { page: 1, per_page: 100, total_count: 2, total_pages: 2 },
      };
    }

    assert.equal(path, "/categories?page=2&per_page=100");
    return {
      categories: [
        { id: "cat-groceries", name: "Groceries", color: "#407706", icon: "shopping-bag", parent: { id: "cat-food", name: "Food & Drink" }, subcategories_count: 0, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
      ],
      pagination: { page: 2, per_page: 100, total_count: 2, total_pages: 2 },
    };
  });

  const categories = await fetchAllCategories(apiKey, request);

  assert.equal(categories.length, 2);
  assert.deepEqual(seenPaths, [
    "/categories?page=1&per_page=100",
    "/categories?page=2&per_page=100",
  ]);
});

test("findCategoryByName matches exact category names case-insensitively", () => {
  const categories = [
    { id: "cat-food", name: "Food & Drink" },
    { id: "cat-groceries", name: "Groceries" },
  ];

  const category = findCategoryByName(categories, "  food & drink ");

  assert.equal(category?.id, "cat-food");
});

test("resolveCategoryId keeps a provided category UUID", async () => {
  const resolved = await resolveCategoryId(
    apiKey,
    { category_id: "00cfe53c-addc-47f0-a55e-97bdd0c17245" },
    createMockRequest(() => {
      throw new Error("should not fetch categories when category_id is already provided");
    })
  );

  assert.equal(resolved, "00cfe53c-addc-47f0-a55e-97bdd0c17245");
});

test("resolveCategoryId resolves category_name to the matching UUID", async () => {
  const request = createMockRequest(() => ({
    categories: [
      { id: "cat-food", name: "Food & Drink", color: "#f97316", icon: "utensils", parent: null, subcategories_count: 1, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
      { id: "cat-groceries", name: "Groceries", color: "#407706", icon: "shopping-bag", parent: { id: "cat-food", name: "Food & Drink" }, subcategories_count: 0, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
    ],
    pagination: { page: 1, per_page: 100, total_count: 2, total_pages: 1 },
  }));

  const resolved = await resolveCategoryId(apiKey, {
    category_name: "Groceries",
  }, request);

  assert.equal(resolved, "cat-groceries");
});

test("resolveCategoryId also accepts the legacy category field as a name alias", async () => {
  const request = createMockRequest(() => ({
    categories: [
      { id: "cat-food", name: "Food & Drink", color: "#f97316", icon: "utensils", parent: null, subcategories_count: 1, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
    ],
    pagination: { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
  }));

  const resolved = await resolveCategoryId(apiKey, {
    category: "Food & Drink",
  }, request);

  assert.equal(resolved, "cat-food");
});

test("categoryIdSchema rejects non-UUID category identifiers", () => {
  assert.throws(
    () => categoryIdSchema.parse("Food & Drink"),
    /uuid/i
  );
});

test("resolveCategoryId fails clearly when a category name is unknown", async () => {
  const request = createMockRequest(() => ({
    categories: [
      { id: "cat-food", name: "Food & Drink", color: "#f97316", icon: "utensils", parent: null, subcategories_count: 1, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
      { id: "cat-groceries", name: "Groceries", color: "#407706", icon: "shopping-bag", parent: { id: "cat-food", name: "Food & Drink" }, subcategories_count: 0, created_at: "2026-03-23T00:00:00Z", updated_at: "2026-03-23T00:00:00Z" },
    ],
    pagination: { page: 1, per_page: 100, total_count: 2, total_pages: 1 },
  }));

  await assert.rejects(
    () => resolveCategoryId(apiKey, { category_name: "Food" }, request),
    /list_categories/
  );
});

test("buildTransactionsQuery uses category_id and per_page", () => {
  const params = buildTransactionsQuery({
    account_id: "account-123",
    start_date: "2026-03-01",
    end_date: "2026-03-31",
    category_id: "00cfe53c-addc-47f0-a55e-97bdd0c17245",
    page: 2,
    per_page: 25,
  });

  assert.equal(
    params.toString(),
    "account_id=account-123&start_date=2026-03-01&end_date=2026-03-31&category_id=00cfe53c-addc-47f0-a55e-97bdd0c17245&page=2&per_page=25"
  );
  assert.equal(params.get("category"), null);
  assert.equal(params.get("limit"), null);
});
