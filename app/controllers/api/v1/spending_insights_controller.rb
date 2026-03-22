# frozen_string_literal: true

class Api::V1::SpendingInsightsController < Api::V1::BaseController
  before_action :ensure_read_scope

  def show
    family = current_resource_owner.family

    unless params[:start_date].present? && params[:end_date].present?
      return render_json(
        { error: "bad_request", message: "start_date and end_date are required parameters" },
        status: :bad_request
      )
    end

    start_date = Date.parse(params[:start_date])
    end_date = Date.parse(params[:end_date])

    # Base query: family transactions, visible, excluding budget-irrelevant kinds
    transactions_query = family.transactions
      .visible
      .where.not(kind: Transaction::BUDGET_EXCLUDED_KINDS)
      .joins(:entry)
      .where("entries.date >= ? AND entries.date <= ?", start_date, end_date)

    # Optional account filter
    if params[:account_id].present?
      transactions_query = transactions_query.where(entries: { account_id: params[:account_id] })
    end

    currency = family.currency

    # Calculate totals (positive amount = expense, negative = income in the data model)
    @total_expenses = transactions_query.where("entries.amount > 0").sum("entries.amount").to_f
    @total_income = transactions_query.where("entries.amount < 0").sum("entries.amount").to_f.abs
    @net = @total_income - @total_expenses

    # Category breakdown (expenses only for spending insight)
    expense_query = transactions_query.where("entries.amount > 0")

    category_data = expense_query
      .left_joins(:category)
      .group("categories.id", "categories.name", "categories.color", "categories.lucide_icon")
      .select(
        "categories.id as category_id",
        "categories.name as category_name",
        "categories.color as category_color",
        "categories.lucide_icon as category_icon",
        "SUM(entries.amount) as total",
        "COUNT(entries.id) as transaction_count"
      )

    @categories = category_data.map do |row|
      {
        id: row.category_id,
        name: row.category_name || "Uncategorized",
        color: row.category_color || Category::UNCATEGORIZED_COLOR,
        icon: row.category_icon || "circle-dashed",
        total: row.total.to_f,
        transaction_count: row.transaction_count,
        percentage: @total_expenses > 0 ? (row.total.to_f / @total_expenses * 100).round(1) : 0
      }
    end.sort_by { |c| -c[:total] }

    @start_date = start_date
    @end_date = end_date
    @currency = currency

    render :show

  rescue Date::Error
    render_json(
      { error: "bad_request", message: "Invalid date format. Use YYYY-MM-DD." },
      status: :bad_request
    )
  rescue => e
    Rails.logger.error "SpendingInsightsController#show error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render_json(
      { error: "internal_server_error", message: "Error: #{e.message}" },
      status: :internal_server_error
    )
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end
end
