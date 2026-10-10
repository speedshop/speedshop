require "date"
require "fileutils"
require "json"
require "minitest/autorun"
require "nokogiri"
require "open3"
require "rbconfig"
require "time"
require "tmpdir"

class WebsiteSnapshotSystemTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)

  def setup
    FileUtils.mkdir_p(File.join(ROOT, "tmp"))
    @directory = Dir.mktmpdir("website-snapshot-", File.join(ROOT, "tmp"))
    @path = File.join(@directory, "snapshot.json")
    @destination = File.join(@directory, "site")
    @payload = JSON.parse(File.read(File.join(ROOT, "test/fixtures/generated_data/snapshot.json")))
    now = Time.now
    today = now.getlocal("+09:00").to_date
    first = today - 180
    last = today >> 9
    @payload["generated_at"] = now.utc.iso8601
    @payload["sla"] = {"start_date" => first.to_s, "end_date" => last.to_s, "days" => (first..last).to_h { |date| [date.to_s, (date > today) ? "future" : "green"] }}
    @payload["availability"].each_with_index { |month, index| month["month"] = (today >> (index + 1)).strftime("%Y-%m") }
  end

  def teardown
    FileUtils.rm_rf(@directory)
  end

  def test_fresh_snapshot_builds_without_private_repository_and_sanitizes_content
    @payload["archive"] << {"issue_date" => "2026-01-17", "markdown" => '<script>alert("export")</script><svg onload="alert(1)"></svg><a href="javascript:alert(1)" onclick="alert(1)">unsafe</a> **safe text**'}
    @payload["reply_histogram"] = {
      "count" => 3, "bin_width_hours" => 1, "max_hours" => 6,
      "percentiles" => {"p99" => 5.98, "p95" => 5.9, "p75" => 5.5, "p50" => 5},
      "bins" => Array.new(7) { |index| {"lower" => index, "upper" => index + 1, "width" => 1, "count" => (index >= 4) ? 1 : 0} }
    }
    output, status = build
    assert status.success?, output.lines.last(30).join
    assert File.file?(File.join(@destination, "holidays.ics"))
    assert_includes File.read(File.join(@destination, "assets/generated/sla-reply-histogram.svg")), 'class="marker-line percentile-marker"'
    page = Nokogiri::HTML(File.read(File.join(@destination, "four-line-fridays.html")))
    lines = page.css(".four-line-text")
    refute lines.css("script, svg, [onclick], [onload]").any?
    refute lines.css("a").any? { |link| link["href"].to_s.start_with?("javascript:") }
    assert_includes lines.text, "safe text"
    refute File.exist?(File.join(@destination, "snapshot.json"))
    refute Dir.exist?(File.join(@destination, "tmp"))
  end

  def test_stale_snapshot_refuses_to_build_and_preserves_previous_output
    @payload["generated_at"] = (Time.now - 25 * 3600).utc.iso8601
    FileUtils.mkdir_p(@destination)
    sentinel = File.join(@destination, "existing.html")
    File.write(sentinel, "previous deployment")
    output, status = build
    refute status.success?
    assert_includes output, "maximum permitted age is 24 hours"
    assert_equal "previous deployment", File.read(sentinel)
  end

  def test_future_timestamp_refuses_to_build
    @payload["generated_at"] = (Time.now + 3600).utc.iso8601
    output, status = build
    refute status.success?
    assert_includes output, "timestamp is in the future"
  end

  def test_unexpected_private_fields_refuse_to_build
    @payload["clients"] = [{"email" => "private@example.com"}]
    output, status = build
    refute status.success?
    assert_includes output, "Unexpected website snapshot fields"
    refute_includes output, "private@example.com"
  end

  def test_malformed_snapshot_does_not_disclose_input_in_build_logs
    File.write(@path, "PRIVATE_SENTINEL not valid JSON")
    output, status = build(write: false)
    refute status.success?
    assert_includes output, "Malformed website snapshot JSON"
    refute_includes output, "PRIVATE_SENTINEL"
  end

  def test_missing_snapshot_refuses_to_build
    output, status = build(write: false)
    refute status.success?
    assert_includes output, "Website snapshot missing"
  end

  def test_production_cannot_bypass_freshness_with_fixtures
    output, status = build(fixtures: File.join(ROOT, "test/fixtures/generated_data"))
    refute status.success?
    assert_includes output, "Production builds cannot use website data fixtures"
  end

  private

  def build(write: true, fixtures: nil)
    File.write(@path, JSON.generate(@payload)) if write
    Open3.capture2e(
      {"JEKYLL_ENV" => "production", "WEBSITE_SNAPSHOT_PATH" => @path, "GENERATED_DATA_FIXTURES_PATH" => fixtures},
      RbConfig.ruby, "-S", "jekyll", "build", "--source", ROOT, "--destination", @destination,
      chdir: ROOT
    )
  end
end
