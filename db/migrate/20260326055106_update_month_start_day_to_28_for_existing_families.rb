class UpdateMonthStartDayTo28ForExistingFamilies < ActiveRecord::Migration[7.2]
  def up
    # Update existing families with month_start_day = 1 to 28
    execute "UPDATE families SET month_start_day = 28 WHERE month_start_day = 1"
  end

  def down
    # Revert back to 1 for families that were updated
    execute "UPDATE families SET month_start_day = 1 WHERE month_start_day = 28"
  end
end
