require "date"
require "fileutils"
require "json"

require_relative "four_line_archive_generator"
require_relative "sla_reply_histogram"
require_relative "website_snapshot"

module Speedshop
  module SlaStatusData
    CUTOFF_DATE = "2026-01-01"
    PASS_FAIL_STATUSES = %w[green red].freeze
    PERFORMANCE_WINDOWS = {
      "last_30_days" => ->(today) { today - 30 },
      "last_90_days" => ->(today) { today - 90 },
      "last_6_months" => ->(today) { today << 6 }
    }.freeze

    module_function

    def normalize!(payload, cutoff_date: CUTOFF_DATE, today: current_japan_date)
      visible_start_date = [payload["start_date"], cutoff_date].compact.max || cutoff_date
      payload["start_date"] = visible_start_date
      payload["holidays"] = Array(payload["holidays"]).select { |holiday| holiday["date"] && holiday["date"] >= visible_start_date }
      payload["days"] = Hash(payload["days"] || {}).select { |date, _status| date >= visible_start_date }
      suppress_current_business_status!(payload, today)
      recalculate_performance!(payload, today)
      payload
    end

    def current_japan_date
      Time.now.getlocal("+09:00").to_date
    end

    def suppress_current_business_status!(payload, today)
      return false unless PASS_FAIL_STATUSES.include?(payload.fetch("days", {})[today.to_s])

      payload["days"][today.to_s] = "future"
      true
    end

    def recalculate_performance!(payload, today)
      payload["performance"] = PERFORMANCE_WINDOWS.transform_values do |start_date_for|
        statuses = payload.fetch("days").filter_map do |date, status|
          status if PASS_FAIL_STATUSES.include?(status) && Date.iso8601(date).between?(start_date_for.call(today), today - 1)
        end
        statuses.empty? ? 0 : (statuses.count("green") * 100.0 / statuses.length).round(1)
      end
    end
  end

  module WebsiteCalendar
    module_function

    def render(holidays)
      lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Speedshop//Japanese Holidays//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Speedshop SLA Holidays"]
      holidays.each do |holiday|
        date = Date.iso8601(holiday.fetch("date"))
        name = holiday.fetch("name").gsub(/[\\\n,;]/) { |character| (character == "\n") ? "\\n" : "\\#{character}" }
        lines.concat([
          "BEGIN:VEVENT",
          "DTSTART;VALUE=DATE:#{date.strftime("%Y%m%d")}",
          "DTEND;VALUE=DATE:#{(date + 1).strftime("%Y%m%d")}",
          "SUMMARY:#{name}",
          "DESCRIPTION:Speedshop SLA does not apply on this day",
          "TRANSP:TRANSPARENT",
          "UID:#{date.strftime("%Y%m%d")}-speedshop-holiday@speedshop.co",
          "END:VEVENT"
        ])
      end
      (lines + ["END:VCALENDAR"]).join("\r\n") + "\r\n"
    end
  end
end

Jekyll::Hooks.register :site, :after_init do |site|
  fixtures = ENV["GENERATED_DATA_FIXTURES_PATH"]
  raise "Production builds cannot use website data fixtures" if fixtures && ENV["JEKYLL_ENV"] == "production"

  path = fixtures ? File.join(fixtures, "snapshot.json") : ENV["WEBSITE_SNAPSHOT_PATH"]
  snapshot = Speedshop::WebsiteSnapshot.load(path, check_freshness: !fixtures)
  data_dir = File.join(site.source, "_data")
  FileUtils.mkdir_p(data_dir)

  sla = snapshot.fetch("sla").merge(
    "generated_at" => snapshot.fetch("generated_at"),
    "sla_policy" => "Respond within 2 business days (Mon-Fri, excluding Japanese holidays)",
    "holidays" => snapshot.fetch("holidays"),
    "reply_histogram" => snapshot.fetch("reply_histogram")
  )
  Speedshop::SlaStatusData.normalize!(sla)
  availability = {"months" => snapshot.fetch("availability").map do |month|
    {"label" => Date.strptime(month.fetch("month"), "%Y-%m").strftime("%B %Y"), "status" => month.fetch("status")}
  end}
  archive = Speedshop::FourLineArchiveGenerator.generate(lines: snapshot.fetch("archive"), generated_at: snapshot.fetch("generated_at"))

  {"sla_status" => sla, "availability" => availability, "four_line_archive" => archive}.each do |name, payload|
    File.write(File.join(data_dir, "#{name}.json"), "#{JSON.pretty_generate(payload)}\n")
  end
  File.write(File.join(site.source, "holidays.ics"), Speedshop::WebsiteCalendar.render(snapshot.fetch("holidays")))
  Speedshop::SlaReplyHistogram.generate(stats: snapshot.fetch("reply_histogram"), output_path: File.join(site.source, Speedshop::SlaReplyHistogram::DEFAULT_OUTPUT_PATH))
end
