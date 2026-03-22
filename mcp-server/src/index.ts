import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SURE_API_BASE = "https://surepersonal.pikapod.net/api/v1";

interface Env {
  SUREAPIKEY: string;
}

// Helper to make authenticated requests to Sure API
async function sureRequest(
  path: string,
  apiKey: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${SURE_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
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
  return response.json();
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
        const data = await sureRequest("/accounts", this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_account",
      "Get details for a specific account by ID",
      { account_id: z.string().describe("The unique ID of the account") },
      async ({ account_id }) => {
        const data = await sureRequest(`/accounts/${account_id}`, this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Transactions ──────────────────────────────────────────────────────────

    this.server.tool(
      "list_transactions",
      "List transactions, optionally filtered by account, date range, or category",
      {
        account_id: z.string().optional().describe("Filter by account ID"),
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
        category: z.string().optional().describe("Filter by spending category"),
        limit: z.number().optional().describe("Max number of transactions to return (default 50)"),
      },
      async ({ account_id, start_date, end_date, category, limit }) => {
        const params = new URLSearchParams();
        if (account_id) params.set("account_id", account_id);
        if (start_date) params.set("start_date", start_date);
        if (end_date) params.set("end_date", end_date);
        if (category) params.set("category", category);
        if (limit) params.set("limit", String(limit));
        const query = params.toString() ? `?${params}` : "";
        const data = await sureRequest(`/transactions${query}`, this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_transaction",
      "Get details for a specific transaction by ID",
      { transaction_id: z.string().describe("The unique ID of the transaction") },
      async ({ transaction_id }) => {
        const data = await sureRequest(`/transactions/${transaction_id}`, this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "create_transaction",
      "Create a new transaction for a specific account",
      {
        account_id: z.string().describe("The unique ID of the account"),
        amount: z.number().describe("Transaction amount (always positive, use nature to indicate income/expense)"),
        description: z.string().describe("Description of the transaction"),
        nature: z.enum(["income", "expense"]).optional().describe("Transaction type: 'income' for money received, 'expense' for money spent. Defaults to expense if omitted."),
        date: z.string().optional().describe("Transaction date in YYYY-MM-DD format"),
        category_id: z.string().optional().describe("The unique ID of the category"),
      },
      async ({ account_id, amount, description, nature, date, category_id }) => {
        const body: Record<string, unknown> = { account_id, amount, description };
        if (nature) body.nature = nature;
        if (date) body.date = date;
        if (category_id) body.category_id = category_id;
        const data = await sureRequest("/transactions", this.env.SUREAPIKEY, "POST", { transaction: body });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Budgets ───────────────────────────────────────────────────────────────

    this.server.tool(
      "list_budgets",
      "List all budgets and their current spending progress",
      {},
      async () => {
        const data = await sureRequest("/budgets", this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_budget",
      "Get details and spending status for a specific budget",
      { budget_id: z.string().describe("The unique ID of the budget") },
      async ({ budget_id }) => {
        const data = await sureRequest(`/budgets/${budget_id}`, this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "create_budget",
      "Create a new spending budget for a category",
      {
        name: z.string().describe("Name of the budget"),
        category: z.string().describe("Spending category (e.g. 'Food & Dining', 'Transport')"),
        amount: z.number().describe("Budget limit amount"),
        period: z.enum(["weekly", "monthly", "yearly"]).describe("Budget period"),
        currency: z.string().optional().describe("Currency code (default: USD)"),
      },
      async ({ name, category, amount, period, currency }) => {
        const data = await sureRequest("/budgets", this.env.SUREAPIKEY, "POST", {
          name,
          category,
          amount,
          period,
          currency: currency ?? "USD",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "update_budget",
      "Update an existing budget's limit or period",
      {
        budget_id: z.string().describe("The unique ID of the budget to update"),
        amount: z.number().optional().describe("New budget limit amount"),
        period: z.enum(["weekly", "monthly", "yearly"]).optional().describe("New budget period"),
        name: z.string().optional().describe("New budget name"),
      },
      async ({ budget_id, amount, period, name }) => {
        const body: Record<string, unknown> = {};
        if (amount !== undefined) body.amount = amount;
        if (period) body.period = period;
        if (name) body.name = name;
        const data = await sureRequest(`/budgets/${budget_id}`, this.env.SUREAPIKEY, "PATCH", body);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "delete_budget",
      "Delete a budget by ID",
      { budget_id: z.string().describe("The unique ID of the budget to delete") },
      async ({ budget_id }) => {
        await sureRequest(`/budgets/${budget_id}`, this.env.SUREAPIKEY, "DELETE");
        return {
          content: [{ type: "text", text: `Budget ${budget_id} deleted successfully.` }],
        };
      }
    );

    // ── Goals ─────────────────────────────────────────────────────────────────

    this.server.tool(
      "list_goals",
      "List all savings goals and their progress",
      {},
      async () => {
        const data = await sureRequest("/goals", this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "create_goal",
      "Create a new savings goal",
      {
        name: z.string().describe("Name of the savings goal"),
        target_amount: z.number().describe("Target savings amount"),
        target_date: z.string().optional().describe("Target completion date in YYYY-MM-DD format"),
        currency: z.string().optional().describe("Currency code (default: USD)"),
      },
      async ({ name, target_amount, target_date, currency }) => {
        const body: Record<string, unknown> = { name, target_amount, currency: currency ?? "USD" };
        if (target_date) body.target_date = target_date;
        const data = await sureRequest("/goals", this.env.SUREAPIKEY, "POST", body);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Net Worth & Summary ───────────────────────────────────────────────────

    this.server.tool(
      "get_net_worth",
      "Get the user's current net worth (total assets minus total liabilities)",
      {},
      async () => {
        const data = await sureRequest("/net-worth", this.env.SUREAPIKEY);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
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
        if (account_id) params.set("account_id", account_id);
        const data = await sureRequest(
          `/reports/spending_summary?${params}`,
          this.env.SUREAPIKEY
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_spending_insights",
      "Get a spending breakdown by category for a given date range, including total income, total expenses, and per-category totals with percentages",
      {
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().describe("End date in YYYY-MM-DD format"),
        account_id: z.string().optional().describe("Optionally filter by account ID"),
      },
      async ({ start_date, end_date, account_id }) => {
        const params = new URLSearchParams({ start_date, end_date });
        if (account_id) params.set("account_id", account_id);
        const data = await sureRequest(
          `/spending_insights?${params}`,
          this.env.SUREAPIKEY
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return SureMcpAgent.mount("/mcp").fetch(request, env, ctx);
  },
};
