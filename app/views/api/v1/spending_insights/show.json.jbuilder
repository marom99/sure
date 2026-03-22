# frozen_string_literal: true

json.period do
  json.start_date @start_date.iso8601
  json.end_date @end_date.iso8601
end

json.currency @currency

json.total_income @total_income
json.total_expenses @total_expenses
json.net @net

json.categories @categories do |category|
  json.id category[:id]
  json.name category[:name]
  json.color category[:color]
  json.icon category[:icon]
  json.total category[:total]
  json.transaction_count category[:transaction_count]
  json.percentage category[:percentage]
end
