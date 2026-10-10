require "date"
require "json"
require "time"

module Speedshop
  class WebsiteSnapshot
    MAX_BYTES = 5 * 1024 * 1024
    MAX_AGE = 24 * 60 * 60

    def self.load(path, now: Time.now, check_freshness: true)
      raise "Website snapshot missing: #{path}" unless path && File.file?(path)
      raise "Website snapshot exceeds 5 MiB" if File.size(path) > MAX_BYTES

      new(JSON.parse(File.read(path)), now: now).validate!(check_freshness: check_freshness)
    rescue JSON::ParserError
      raise "Malformed website snapshot JSON", cause: nil
    rescue ArgumentError
      raise "Invalid website snapshot data", cause: nil
    end

    def initialize(payload, now: Time.now)
      @payload = payload
      @now = now
    end

    def validate!(check_freshness: true)
      object!(@payload, %w[version generated_at sla availability holidays archive reply_histogram])
      check!(@payload["version"].is_a?(Integer) && @payload["version"] == 1, "Unsupported website snapshot version")
      timestamp = @payload["generated_at"]
      check!(timestamp.is_a?(String) && timestamp.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\z/), "Invalid snapshot timestamp")
      generated_at = Time.iso8601(timestamp)
      if check_freshness
        age = @now - generated_at
        check!(age >= -300, "Website snapshot timestamp is in the future")
        check!(age <= MAX_AGE, "Website data is more than 24 hours old (generated at #{timestamp}); maximum permitted age is 24 hours. The client_notes export pipeline may be failing. Build aborted.")
      end
      validate_sla!
      validate_availability!
      validate_holidays!
      validate_archive!(generated_at.getlocal("+09:00").to_date)
      validate_histogram!
      @payload
    end

    private

    def validate_sla!
      sla = @payload["sla"]
      object!(sla, %w[start_date end_date days])
      first = date!(sla["start_date"])
      last = date!(sla["end_date"])
      check!(first <= last && (last - first) <= 730, "Invalid SLA coverage")
      days = sla["days"]
      check!(days.is_a?(Hash) && days.keys.sort == (first..last).map(&:to_s), "Incomplete SLA days")
      check!(days.values.all? { |status| %w[green red weekend holiday future].include?(status) }, "Invalid SLA status")
      today = Time.iso8601(@payload["generated_at"]).getlocal("+09:00").to_date
      check!(first <= today && last >= today >> 3, "SLA snapshot does not cover its generation date")
    end

    def validate_availability!
      months = @payload["availability"]
      array!(months, 3)
      check!(months.length == 3, "Availability must contain three months")
      today = Time.iso8601(@payload["generated_at"]).getlocal("+09:00").to_date
      months.each_with_index do |month, index|
        object!(month, %w[month status])
        check!(month["month"] == (today >> (index + 1)).strftime("%Y-%m"), "Invalid availability month")
        check!(%w[available limited full].include?(month["status"]), "Invalid availability status")
      end
    end

    def validate_holidays!
      holidays = @payload["holidays"]
      array!(holidays, 200)
      holidays.each do |holiday|
        object!(holiday, %w[date name])
        date!(holiday["date"])
        text!(holiday["name"], 200)
      end
      check!(holidays.map { |holiday| holiday["date"] }.uniq.length == holidays.length, "Duplicate holidays")
    end

    def validate_archive!(today)
      array!(@payload["archive"], 10000)
      @payload["archive"].each do |line|
        object!(line, %w[issue_date markdown])
        check!(date!(line["issue_date"]) <= today, "Unreleased newsletter issue")
        text!(line["markdown"], 10000)
      end
    end

    def validate_histogram!
      histogram = @payload["reply_histogram"]
      object!(histogram, %w[count bin_width_hours max_hours percentiles bins])
      count!(histogram["count"])
      number!(histogram["bin_width_hours"])
      object!(histogram["percentiles"], %w[p50 p75 p95 p99])
      percentiles = %w[p50 p75 p95 p99].map { |key| histogram["percentiles"][key] }
      values = [histogram["max_hours"], *percentiles]
      if histogram["count"].zero?
        check!(values.all?(&:nil?) && histogram["bins"] == [] && histogram["bin_width_hours"].zero?, "Invalid empty histogram")
        return
      end
      values.each { |value| number!(value) }
      check!(percentiles == percentiles.sort, "Invalid percentile order")
      check!(percentiles.max <= histogram["max_hours"], "Percentile exceeds maximum")
      check!(histogram["bin_width_hours"] == 1, "Unsupported histogram bin width")
      array!(histogram["bins"], 10000)
      check!(histogram["bins"].length == histogram["max_hours"].floor + 1, "Incomplete histogram bins")
      histogram["bins"].each_with_index do |bin, index|
        object!(bin, %w[lower upper width count])
        check!(bin["lower"] == index && bin["upper"] == index + 1 && bin["width"] == 1, "Invalid histogram bin")
        count!(bin["count"])
      end
      check!(histogram["bins"].sum { |bin| bin["count"] } == histogram["count"], "Histogram count mismatch")
    end

    def object!(value, keys)
      check!(value.is_a?(Hash) && value.keys.sort == keys.sort, "Unexpected website snapshot fields")
    end

    def array!(value, maximum)
      check!(value.is_a?(Array) && value.length <= maximum, "Invalid website snapshot list")
    end

    def date!(value)
      check!(value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/), "Invalid website snapshot date")
      Date.iso8601(value)
    end

    def text!(value, maximum)
      check!(value.is_a?(String) && value.valid_encoding? && value.length.between?(1, maximum) && !value.match?(/[\x00-\x08\x0b-\x1f\x7f]/), "Invalid website snapshot text")
    end

    def number!(value)
      check!(value.is_a?(Numeric) && value.finite? && value.between?(0, 10000), "Invalid website snapshot number")
    end

    def count!(value)
      check!(value.is_a?(Integer) && value.between?(0, 1000000), "Invalid website snapshot count")
    end

    def check!(condition, message)
      raise message unless condition
    end
  end
end
