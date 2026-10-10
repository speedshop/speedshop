require "minitest/autorun"
require "jekyll"

require_relative "../../_plugins/generate_data"

class SlaStatusDataTest < Minitest::Test
  def test_normalize_never_marks_current_day_red
    payload = status_payload(
      "2026-06-25" => "green",
      "2026-06-26" => "red",
      "2026-06-29" => "red",
      "2026-06-30" => "future"
    )
    Speedshop::SlaStatusData.normalize!(payload, today: Date.new(2026, 6, 29))
    assert_equal "future", payload.fetch("days").fetch("2026-06-29")
    assert_equal 50.0, payload.fetch("performance").fetch("last_30_days")
  end

  def test_normalize_excludes_current_day_from_passing_status_too
    payload = status_payload(
      "2026-06-25" => "green",
      "2026-06-26" => "red",
      "2026-06-29" => "green"
    )
    Speedshop::SlaStatusData.normalize!(payload, today: Date.new(2026, 6, 29))
    assert_equal "future", payload.fetch("days").fetch("2026-06-29")
    assert_equal 50.0, payload.fetch("performance").fetch("last_30_days")
  end

  def status_payload(days)
    {
      "sla_policy" => "Respond within 2 business days",
      "generated_at" => "2026-06-29T00:00:00Z",
      "start_date" => "2026-01-01",
      "end_date" => "2026-12-31",
      "holidays" => [],
      "days" => days
    }
  end
end
