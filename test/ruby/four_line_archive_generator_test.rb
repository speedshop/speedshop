require "minitest/autorun"

require_relative "../../_plugins/four_line_archive_generator"

class FourLineArchiveGeneratorTest < Minitest::Test
  FIXTURE_CLIENT_NOTES_PATH = File.expand_path("../fixtures/client_notes", __dir__)

  def test_default_payload_defaults_to_empty_archive
    result = Speedshop::FourLineArchiveGenerator.default_payload

    assert_equal 0, result["issue_count"]
    assert_equal 0, result["line_count"]
    assert_equal [], result["lines"]
  end

  def test_generate_defaults_when_archive_directory_is_missing
    non_default = Speedshop::FourLineArchiveGenerator.generate(client_notes_path: FIXTURE_CLIENT_NOTES_PATH)
    refute_equal Speedshop::FourLineArchiveGenerator.default_payload, non_default

    result = Speedshop::FourLineArchiveGenerator.generate(client_notes_path: "/path/that/does/not/exist")
    assert_equal Speedshop::FourLineArchiveGenerator.default_payload, result
  end

  def test_generate_extracts_numbered_lines_with_html_and_text
    result = Speedshop::FourLineArchiveGenerator.generate(client_notes_path: FIXTURE_CLIENT_NOTES_PATH)

    assert_equal 2, result["issue_count"]
    assert_equal 8, result["line_count"]

    newest_first = result["lines"].first
    assert_equal "2026-01-10", newest_first["issue_date"]
    refute_includes newest_first.keys, "line_number"

    linked_line = result["lines"].find { |line| line["line_text"] == "First line link with context." }
    assert_match(/^2026-01-03-/, linked_line["id"])
    assert_includes linked_line["line_html"], "<a href=\"https://example.com/one\""
  end
end
