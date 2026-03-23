import { z } from "zod";

export const SURE_API_BASE = "https://surepersonal.pikapod.net/api/v1";

export interface SureCategoryParent {
  id: string;
  name: string;
}

export interface SureCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  parent: SureCategoryParent | null;
  subcategories_count: number;
  created_at: string;
  updated_at: string;
}

export interface SurePagination {
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
}

export interface SureCategoriesResponse {
  categories: SureCategory[];
  pagination: SurePagination;
}

export interface CategorySelectorInput {
  category_id?: string;
  category_name?: string;
  category?: string;
}

export type SureRequest = <T = unknown>(
  path: string,
  apiKey: string,
  method?: string,
  body?: Record<string, unknown>
) => Promise<T>;

const MAX_PAGE_SIZE = 100;

export const categoryIdSchema = z
  .string()
  .uuid()
  .describe("The UUID of an existing Sure category");

export const categoryNameSchema = z
  .string()
  .min(1)
  .describe("The exact category name to resolve, such as 'Food & Drink'");

export const pageSchema = z
  .number()
  .int()
  .min(1)
  .describe("Page number");

export const perPageSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .describe("Items per page (max 100)");

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createJsonToolResult(data: unknown) {
  const result: {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
  } = {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };

  if (isRecord(data)) {
    result.structuredContent = data;
  }

  return result;
}

export async function sureRequest<T = unknown>(
  path: string,
  apiKey: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${SURE_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sure API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchCategoriesPage(
  apiKey: string,
  request: SureRequest = sureRequest,
  params: {
    page?: number;
    per_page?: number;
    roots_only?: boolean;
    parent_id?: string;
  } = {}
): Promise<SureCategoriesResponse> {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.per_page !== undefined) {
    searchParams.set("per_page", String(params.per_page));
  }

  if (params.roots_only !== undefined) {
    searchParams.set("roots_only", String(params.roots_only));
  }

  if (params.parent_id) {
    searchParams.set("parent_id", params.parent_id);
  }

  const query = searchParams.toString() ? `?${searchParams}` : "";
  return request<SureCategoriesResponse>(`/categories${query}`, apiKey);
}

export async function fetchAllCategories(
  apiKey: string,
  request: SureRequest = sureRequest
): Promise<SureCategory[]> {
  const firstPage = await fetchCategoriesPage(apiKey, request, {
    page: 1,
    per_page: MAX_PAGE_SIZE,
  });

  const categories = [...firstPage.categories];
  const totalPages = firstPage.pagination.total_pages;

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchCategoriesPage(apiKey, request, {
      page,
      per_page: MAX_PAGE_SIZE,
    });
    categories.push(...nextPage.categories);
  }

  return categories;
}

export function findCategoryByName(
  categories: SureCategory[],
  categoryName: string
): SureCategory | undefined {
  const normalizedTarget = normalizeCategoryName(categoryName);

  return categories.find(
    (category) => normalizeCategoryName(category.name) === normalizedTarget
  );
}

function suggestCategoryNames(
  categories: SureCategory[],
  categoryName: string,
  limit: number = 5
): string[] {
  const normalizedTarget = normalizeCategoryName(categoryName);

  return categories
    .filter((category) => {
      const normalizedName = normalizeCategoryName(category.name);
      return (
        normalizedName.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedName)
      );
    })
    .map((category) => category.name)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

export function assertExclusiveCategorySelector({
  category_id,
  category_name,
  category,
}: CategorySelectorInput): void {
  const hasNameSelector = Boolean(category_name || category);

  if (category_id && hasNameSelector) {
    throw new Error(
      "Provide either category_id or a category name, not both."
    );
  }

  if (category_name && category) {
    throw new Error("Provide either category_name or category, not both.");
  }
}

export async function resolveCategoryId(
  apiKey: string,
  selector: CategorySelectorInput,
  request: SureRequest = sureRequest
): Promise<string | undefined> {
  assertExclusiveCategorySelector(selector);

  if (selector.category_id) {
    return selector.category_id;
  }

  const categoryName = selector.category_name ?? selector.category;

  if (!categoryName) {
    return undefined;
  }

  const categories = await fetchAllCategories(apiKey, request);
  const matchedCategory = findCategoryByName(categories, categoryName);

  if (matchedCategory) {
    return matchedCategory.id;
  }

  const suggestions = suggestCategoryNames(categories, categoryName);
  const suggestionsSuffix =
    suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";

  throw new Error(
    `Category "${categoryName}" was not found. Use list_categories to find a valid category name or UUID.${suggestionsSuffix}`
  );
}

export function buildTransactionsQuery(params: {
  account_id?: string;
  start_date?: string;
  end_date?: string;
  category_id?: string;
  page?: number;
  per_page?: number;
}): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.account_id) {
    searchParams.set("account_id", params.account_id);
  }

  if (params.start_date) {
    searchParams.set("start_date", params.start_date);
  }

  if (params.end_date) {
    searchParams.set("end_date", params.end_date);
  }

  if (params.category_id) {
    searchParams.set("category_id", params.category_id);
  }

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.per_page !== undefined) {
    searchParams.set("per_page", String(params.per_page));
  }

  return searchParams;
}
