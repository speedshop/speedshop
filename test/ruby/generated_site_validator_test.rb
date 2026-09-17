require "fileutils"
require "json"
require "minitest/autorun"
require "tmpdir"

require_relative "../../_scripts/generated_site_validator"

class GeneratedSiteValidatorTest < Minitest::Test
  def setup
    @root = Dir.mktmpdir
    @site_dir = File.join(@root, "_site")
    @data_dir = File.join(@root, "_data")
    FileUtils.mkdir_p([@site_dir, @data_dir])

    File.write(File.join(@site_dir, "status.html"), <<~HTML)
      <p><b>Policy: </b>Replies within one business day.</p>
      <span class="stat-value">100%</span>
      <script>var statusData = {"2026-01-05":"green"}; new Date('2026-01-01');</script>
    HTML
    File.write(File.join(@site_dir, "holidays.ics"), "BEGIN:VCALENDAR\n#{"X" * 100}\nEND:VCALENDAR\n")

    @line = {
      "id" => "2026-01-17-example",
      "issue_date" => "2026-01-17",
      "line_text" => "Ruby & Rails"
    }
    File.write(File.join(@data_dir, "four_line_archive.json"), JSON.generate("line_count" => 1, "lines" => [@line]))
    write_archive_page(<<~HTML)
      <ul id="four-line-results">
        <li class="four-line-result" id="2026-01-17-example" data-search="ruby &amp; rails 2026-01-17">
          <a class="four-line-permalink" href="#2026-01-17-example">#</a>
        </li>
      </ul>
    HTML
  end

  def teardown
    FileUtils.rm_rf(@root)
  end

  def test_accepts_the_server_rendered_archive_without_legacy_json_script
    validator.validate!
  end

  def test_rejects_a_missing_rendered_archive_list
    write_archive_page("<h1>Four Line Fridays Archive</h1>")

    error = assert_raises(Speedshop::GeneratedSiteValidator::ValidationError) { validator.validate! }
    assert_includes error.message, "Rendered archive list is missing"
  end

  def test_rejects_malformed_rendered_archive_entries
    write_archive_page(<<~HTML)
      <ul id="four-line-results">
        <li class="four-line-result" id="2026-01-17-example" data-search="wrong">
          <a class="four-line-permalink" href="#wrong">#</a>
        </li>
      </ul>
    HTML

    error = assert_raises(Speedshop::GeneratedSiteValidator::ValidationError) { validator.validate! }
    assert_includes error.message, "invalid search data"
    assert_includes error.message, "invalid permalink"
  end

  def test_rejects_empty_archive_when_a_source_is_configured
    File.write(File.join(@data_dir, "four_line_archive.json"), JSON.generate("line_count" => 0, "lines" => []))

    configured_validator = Speedshop::GeneratedSiteValidator.new(
      site_dir: @site_dir,
      data_dir: @data_dir,
      archive_source_configured: true
    )
    error = assert_raises(Speedshop::GeneratedSiteValidator::ValidationError) { configured_validator.validate! }
    assert_includes error.message, "FLF archive is empty despite an archive source being configured"
  end

  private

  def validator
    Speedshop::GeneratedSiteValidator.new(site_dir: @site_dir, data_dir: @data_dir)
  end

  def write_archive_page(content)
    File.write(File.join(@site_dir, "four-line-fridays.html"), content)
  end
end
