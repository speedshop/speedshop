require "minitest/autorun"
require "tmpdir"

require_relative "../../_plugins/sla_reply_histogram"

class SlaReplyHistogramTest < Minitest::Test
  def test_business_hours_between_skips_weekends
    holidays = Set.new
    start_time = Time.local(2026, 1, 9, 10, 0, 0)
    end_time = Time.local(2026, 1, 12, 9, 0, 0)

    assert_equal 7.0, Speedshop::SlaReplyHistogram.business_hours_between(start_time, end_time, holidays: holidays)
  end

  def test_business_hours_between_skips_japanese_holidays
    holidays = Set.new([Date.new(2026, 1, 12)])
    start_time = Time.local(2026, 1, 9, 12, 0, 0)
    end_time = Time.local(2026, 1, 13, 12, 0, 0)

    assert_equal 8.0, Speedshop::SlaReplyHistogram.business_hours_between(start_time, end_time, holidays: holidays)
  end

  def test_reply_hours_uses_consecutive_inbox_logs_after_cutoff
    Dir.mktmpdir do |dir|
      inbox_log_path = File.join(dir, "inbox.log")
      holidays_path = File.join(dir, "holidays.yml")
      File.write(inbox_log_path, <<~LOG)
        2025-12-31 10:00:00 - Inbox clearing completed
        2026-01-02 10:00:00 - Inbox clearing completed
        2026-01-05 10:00:00 - Inbox clearing completed
      LOG
      File.write(holidays_path, "[]\n")

      result = Speedshop::SlaReplyHistogram.reply_hours(
        inbox_log_path: inbox_log_path,
        holidays_path: holidays_path,
        cutoff_date: Date.new(2026, 1, 1)
      )

      assert_equal [8.0], result
    end
  end

  def test_reply_hours_keeps_every_consecutive_interval
    Dir.mktmpdir do |dir|
      inbox_log_path = File.join(dir, "inbox.log")
      holidays_path = File.join(dir, "holidays.yml")
      File.write(inbox_log_path, <<~LOG)
        2026-01-05 06:00:00 - Inbox clearing completed
        2026-01-05 12:00:00 - Inbox clearing completed
        2026-01-06 09:00:00 - Inbox clearing completed
      LOG
      File.write(holidays_path, "[]\n")

      result = Speedshop::SlaReplyHistogram.reply_hours(
        inbox_log_path: inbox_log_path,
        holidays_path: holidays_path,
        cutoff_date: Date.new(2026, 1, 1)
      )

      assert_equal [6.0, 5.0], result
    end
  end

  def test_business_date_for_uses_calendar_date_when_business_window_ends_same_day
    assert_equal Date.new(2026, 1, 6), Speedshop::SlaReplyHistogram.business_date_for(Time.local(2026, 1, 6, 0, 30, 0))
  end

  def test_stats_include_percentiles_and_bins
    stats = Speedshop::SlaReplyHistogram.stats_for([1.0, 2.0, 3.0, 4.0])

    assert_equal 4, stats.fetch("count")
    assert_equal 1, stats.fetch("bin_width_hours")
    assert_equal 2.5, stats.fetch("percentiles").fetch("p50")
    assert stats.fetch("bins").any?
  end

  def test_generate_writes_svg
    Dir.mktmpdir do |dir|
      client_notes_path = File.join(dir, "client_notes_repo")
      FileUtils.mkdir_p(File.join(client_notes_path, "client_notes", "logs"))
      FileUtils.mkdir_p(File.join(client_notes_path, "client_notes", "data"))
      File.write(File.join(client_notes_path, "client_notes", "logs", "inbox.log"), <<~LOG)
        2026-01-05 09:00:00 - Inbox clearing completed
        2026-01-06 09:00:00 - Inbox clearing completed
      LOG
      File.write(File.join(client_notes_path, "client_notes", "data", "japanese_holidays.yml"), "[]\n")

      output_path = File.join(dir, "histogram.svg")
      stats = Speedshop::SlaReplyHistogram.generate(client_notes_path: client_notes_path, output_path: output_path)

      assert_equal 1, stats.fetch("count")
      assert_includes File.read(output_path), "<svg"
      assert_includes File.read(output_path), "p50"
    end
  end
end
