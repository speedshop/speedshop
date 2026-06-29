require "minitest/autorun"
require "tmpdir"
require "jekyll"

require_relative "../../_plugins/generate_data"

class SlaStatusDataTest < Minitest::Test
  def test_normalize_file_never_marks_current_day_red
    Dir.mktmpdir do |dir|
      path = File.join(dir, "sla_status.json")
      File.write(path, JSON.pretty_generate(status_payload(
        "2026-06-25" => "green",
        "2026-06-26" => "red",
        "2026-06-29" => "red",
        "2026-06-30" => "future"
      )))

      Speedshop::SlaStatusData.normalize_file!(path, today: Date.new(2026, 6, 29))

      payload = JSON.parse(File.read(path))
      assert_equal "future", payload.fetch("days").fetch("2026-06-29")
      assert_equal 50.0, payload.fetch("performance").fetch("last_30_days")
    end
  end

  def test_normalize_file_excludes_current_day_from_passing_status_too
    Dir.mktmpdir do |dir|
      path = File.join(dir, "sla_status.json")
      File.write(path, JSON.pretty_generate(status_payload(
        "2026-06-25" => "green",
        "2026-06-26" => "red",
        "2026-06-29" => "green"
      )))

      Speedshop::SlaStatusData.normalize_file!(path, today: Date.new(2026, 6, 29))

      payload = JSON.parse(File.read(path))
      assert_equal "future", payload.fetch("days").fetch("2026-06-29")
      assert_equal 50.0, payload.fetch("performance").fetch("last_30_days")
    end
  end

  def status_payload(days)
    {
      "sla_policy" => "Respond within 2 business days",
      "generated_at" => "2026-06-29T00:00:00Z",
      "start_date" => "2026-01-01",
      "end_date" => "2026-12-31",
      "holidays" => [],
      "days" => days,
      "performance" => {
        "last_30_days" => 0,
        "last_90_days" => 0,
        "last_6_months" => 0
      }
    }
  end
end
