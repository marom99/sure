import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  buildTransactionsQuery,
  categoryIdSchema,
  categoryNameSchema,
  createJsonToolResult,
  fetchCategoriesPage,
  pageSchema,
  perPageSchema,
  resolveCategoryId,
  sureRequest,
} from "./sure-api.ts";

interface Env {
  SURE_API_KEY: string;
}

export class SureMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "sure-personal-finance",
    version: "1.0.0",
  });

  async init() {
    // ── Accounts ──────────────────────────────────────────────────────────────

    this.server.tool(
      "list_accounts",
      "List all financial accounts connected to Sure (bank, credit, investment, etc.)",
      {},
      async () => {
        const data = await sureRequest("/accounts", this.env.SURE_API_KEY);
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "get_account",
      "Get details for a specific account by ID",
      { account_id: z.string().describe("The unique ID of the account") },
      async ({ account_id }) => {
        const data = await sureRequest(
          `/accounts/${account_id}`,
          this.env.SURE_API_KEY
        );
        return createJsonToolResult(data);
      }
    );

    // ── Categories ────────────────────────────────────────────────────────────

    this.server.tool(
      "list_categories",
      "List available Sure categories with UUIDs so transactions can be assigned to valid categories",
      {
        page: pageSchema.optional(),
        per_page: perPageSchema.optional(),
        roots_only: z
          .boolean()
          .optional()
          .describe("Only return top-level categories"),
        parent_id: z
          .string()
          .uuid()
          .optional()
          .describe("Filter categories by parent category UUID"),
      },
      async ({ page, per_page, roots_only, parent_id }) => {
        const data = await fetchCategoriesPage(this.env.SURE_API_KEY, sureRequest, {
          page,
          per_page,
          roots_only,
          parent_id,
        });

        return createJsonToolResult(data);
      }
    );

    // ── Transactions ──────────────────────────────────────────────────────────

    this.server.tool(
      "list_transactions",
      "List transactions, optionally filtered by account, date range, or category",
      {
        account_id: z.string().optional().describe("Filter by account ID"),
        start_date: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format"),
        end_date: z
          .string()
          .optional()
          .describe("End date in YYYY-MM-DD format"),
        category_id: categoryIdSchema.optional(),
        category_name: categoryNameSchema.optional(),
        category: categoryNameSchema.optional(),
        page: pageSchema.optional(),
        per_page: perPageSchema.optional(),
      },
      async ({
        account_id,
        start_date,
        end_date,
        category_id,
        category_name,
        category,
        page,
        per_page,
      }) => {
        const resolvedCategoryId = await resolveCategoryId(
          this.env.SURE_API_KEY,
          { category_id, category_name, category },
          sureRequest
        );

        const params = buildTransactionsQuery({
          account_id,
          start_date,
          end_date,
          category_id: resolvedCategoryId,
          page,
          per_page,
        });
        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await sureRequest(
          `/transactions${query}`,
          this.env.SURE_API_KEY
        );

        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "get_transaction",
      "Get details for a specific transaction by ID",
      {
        transaction_id: z.string().describe("The unique ID of the transaction"),
      },
      async ({ transaction_id }) => {
        const data = await sureRequest(
          `/transactions/${transaction_id}`,
          this.env.SURE_API_KEY
        );
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "create_transaction",
      "Create a new transaction for a specific account",
      {
        account_id: z.string().describe("The unique ID of the account"),
        amount: z
          .number()
          .describe(
            "Transaction amount (always positive, use nature to indicate income/expense)"
          ),
        description: z.string().describe("Description of the transaction"),
        nature: z
          .enum(["income", "expense"])
          .optional()
          .describe(
            "Transaction type: 'income' for money received, 'expense' for money spent. Defaults to expense if omitted."
          ),
        date: z
          .string()
          .optional()
          .describe("Transaction date in YYYY-MM-DD format"),
        category_id: categoryIdSchema.optional(),
        category_name: categoryNameSchema.optional(),
        category: categoryNameSchema.optional(),
      },
      async ({
        account_id,
        amount,
        description,
        nature,
        date,
        category_id,
        category_name,
        category,
      }) => {
        const resolvedCategoryId = await resolveCategoryId(
          this.env.SURE_API_KEY,
          { category_id, category_name, category },
          sureRequest
        );

        const body: Record<string, unknown> = { account_id, amount, description };
        if (nature) {
          body.nature = nature;
        }
        if (date) {
          body.date = date;
        }
        if (resolvedCategoryId) {
          body.category_id = resolvedCategoryId;
        }

        const data = await sureRequest(
          "/transactions",
          this.env.SURE_API_KEY,
          "POST",
          { transaction: body }
        );

        return createJsonToolResult(data);
      }
    );

    // ── Budgets ───────────────────────────────────────────────────────────────

    this.server.tool(
      "list_budgets",
      "List all budgets and their current spending progress",
      {},
      async () => {
        const data = await sureRequest("/budgets", this.env.SURE_API_KEY);
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "get_budget",
      "Get details and spending status for a specific budget",
      { budget_id: z.string().describe("The unique ID of the budget") },
      async ({ budget_id }) => {
        const data = await sureRequest(
          `/budgets/${budget_id}`,
          this.env.SURE_API_KEY
        );
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "create_budget",
      "Create a new spending budget for a category",
      {
        name: z.string().describe("Name of the budget"),
        category: z
          .string()
          .describe("Spending category (e.g. 'Food & Dining', 'Transport')"),
        amount: z.number().describe("Budget limit amount"),
        period: z
          .enum(["weekly", "monthly", "yearly"])
          .describe("Budget period"),
        currency: z.string().optional().describe("Currency code (default: USD)"),
      },
      async ({ name, category, amount, period, currency }) => {
        const data = await sureRequest("/budgets", this.env.SURE_API_KEY, "POST", {
          name,
          category,
          amount,
          period,
          currency: currency ?? "USD",
        });
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "update_budget",
      "Update an existing budget's limit or period",
      {
        budget_id: z
          .string()
          .describe("The unique ID of the budget to update"),
        amount: z.number().optional().describe("New budget limit amount"),
        period: z
          .enum(["weekly", "monthly", "yearly"])
          .optional()
          .describe("New budget period"),
        name: z.string().optional().describe("New budget name"),
      },
      async ({ budget_id, amount, period, name }) => {
        const body: Record<string, unknown> = {};
        if (amount !== undefined) {
          body.amount = amount;
        }
        if (period) {
          body.period = period;
        }
        if (name) {
          body.name = name;
        }

        const data = await sureRequest(
          `/budgets/${budget_id}`,
          this.env.SURE_API_KEY,
          "PATCH",
          body
        );
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "delete_budget",
      "Delete a budget by ID",
      { budget_id: z.string().describe("The unique ID of the budget to delete") },
      async ({ budget_id }) => {
        await sureRequest(
          `/budgets/${budget_id}`,
          this.env.SURE_API_KEY,
          "DELETE"
        );
        return {
          content: [
            {
              type: "text",
              text: `Budget ${budget_id} deleted successfully.`,
            },
          ],
        };
      }
    );

    // ── Goals ─────────────────────────────────────────────────────────────────

    this.server.tool(
      "list_goals",
      "List all savings goals and their progress",
      {},
      async () => {
        const data = await sureRequest("/goals", this.env.SURE_API_KEY);
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "create_goal",
      "Create a new savings goal",
      {
        name: z.string().describe("Name of the savings goal"),
        target_amount: z.number().describe("Target savings amount"),
        target_date: z
          .string()
          .optional()
          .describe("Target completion date in YYYY-MM-DD format"),
        currency: z.string().optional().describe("Currency code (default: USD)"),
      },
      async ({ name, target_amount, target_date, currency }) => {
        const body: Record<string, unknown> = {
          name,
          target_amount,
          currency: currency ?? "USD",
        };
        if (target_date) {
          body.target_date = target_date;
        }

        const data = await sureRequest(
          "/goals",
          this.env.SURE_API_KEY,
          "POST",
          body
        );
        return createJsonToolResult(data);
      }
    );

    // ── Net Worth & Summary ───────────────────────────────────────────────────

    this.server.tool(
      "get_net_worth",
      "Get the user's current net worth (total assets minus total liabilities)",
      {},
      async () => {
        const data = await sureRequest("/net-worth", this.env.SURE_API_KEY);
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "get_spending_summary",
      "Get a summary of spending broken down by category for a given period",
      {
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().describe("End date in YYYY-MM-DD format"),
        account_id: z.string().optional().describe("Optionally filter by account"),
      },
      async ({ start_date, end_date, account_id }) => {
        const params = new URLSearchParams({ start_date, end_date });
        if (account_id) {
          params.set("account_id", account_id);
        }

        const data = await sureRequest(
          `/spending_insights?${params.toString()}`,
          this.env.SURE_API_KEY
        );
        return createJsonToolResult(data);
      }
    );

    this.server.tool(
      "get_spending_insights",
      "Get a spending breakdown by category for a given date range, including total income, total expenses, and per-category totals with percentages",
      {
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().describe("End date in YYYY-MM-DD format"),
        account_id: z
          .string()
          .optional()
          .describe("Optionally filter by account ID"),
      },
      async ({ start_date, end_date, account_id }) => {
        const params = new URLSearchParams({ start_date, end_date });
        if (account_id) {
          params.set("account_id", account_id);
        }

        const data = await sureRequest(
          `/spending_insights?${params.toString()}`,
          this.env.SURE_API_KEY
        );
        return createJsonToolResult(data);
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return SureMcpAgent.mount("/mcp").fetch(request, env, ctx);
  },
};
