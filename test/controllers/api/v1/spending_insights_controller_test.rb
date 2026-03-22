# frozen_string_literal: true

require "test_helper"

class Api::V1::SpendingInsightsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = @family.accounts.first

    # Destroy existing active API keys to avoid validation errors
    @user.api_keys.active.destroy_all

    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Write Key",
      scopes: [ "read_write" ],
      display_key: "test_rw_#{SecureRandom.hex(8)}"
    )

    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Only Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    # Clear any existing rate limit data
    Redis.new.del("api_rate_limit:#{@api_key.id}")
    Redis.new.del("api_rate_limit:#{@read_only_api_key.id}")
  end

  test "should get spending insights with valid API key and date params" do
    get api_v1_spending_insights_url,
        params: { start_date: 3.months.ago.to_date, end_date: Date.current },
        headers: api_headers(@api_key)
    assert_response :success

    data = JSON.parse(response.body)
    assert data.key?("period")
    assert data["period"].key?("start_date")
    assert data["period"].key?("end_date")
    assert data.key?("currency")
    assert data.key?("total_income")
    assert data.key?("total_expenses")
    assert data.key?("net")
    assert data.key?("categories")
    assert_kind_of Array, data["categories"]
  end

  test "should get spending insights with read-only API key" do
    get api_v1_spending_insights_url,
        params: { start_date: 1.month.ago.to_date, end_date: Date.current },
        headers: api_headers(@read_only_api_key)
    assert_response :success
  end

  test "should return bad request when start_date missing" do
    get api_v1_spending_insights_url,
        params: { end_date: Date.current },
        headers: api_headers(@api_key)
    assert_response :bad_request
  end

  test "should return bad request when end_date missing" do
    get api_v1_spending_insights_url,
        params: { start_date: 1.month.ago.to_date },
        headers: api_headers(@api_key)
    assert_response :bad_request
  end

  test "should reject request without API key" do
    get api_v1_spending_insights_url,
        params: { start_date: 1.month.ago.to_date, end_date: Date.current }
    assert_response :unauthorized
  end

  test "categories should have expected structure" do
    # Create a test transaction with a category
    category = @family.categories.first
    entry = @account.entries.create!(
      name: "Test Expense",
      amount: 42.00,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(category: category)
    )

    get api_v1_spending_insights_url,
        params: { start_date: 1.month.ago.to_date, end_date: Date.current },
        headers: api_headers(@api_key)
    assert_response :success

    data = JSON.parse(response.body)
    assert data["total_expenses"] > 0

    cat_with_data = data["categories"].find { |c| c["id"] == category.id }
    if cat_with_data
      assert cat_with_data.key?("name")
      assert cat_with_data.key?("total")
      assert cat_with_data.key?("transaction_count")
      assert cat_with_data.key?("percentage")
      assert_operator cat_with_data["transaction_count"], :>=, 1
    end
  end

  test "should filter by account_id" do
    get api_v1_spending_insights_url,
        params: { start_date: 3.months.ago.to_date, end_date: Date.current, account_id: @account.id },
        headers: api_headers(@api_key)
    assert_response :success
  end

  private

    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end
end
