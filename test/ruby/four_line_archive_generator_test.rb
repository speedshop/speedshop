require "json"
require "minitest/autorun"

require_relative "../../_plugins/four_line_archive_generator"

class FourLineArchiveGeneratorTest < Minitest::Test
  def snapshot
    JSON.parse(File.read(File.expand_path("../fixtures/generated_data/snapshot.json", __dir__)))
  end

  def test_generate_empty_archive
    result = Speedshop::FourLineArchiveGenerator.generate(lines: [], generated_at: "2026-01-17T00:00:00Z")
    assert_equal 0, result["issue_count"]
    assert_equal 0, result["line_count"]
    assert_equal [], result["lines"]
  end

  def test_generate_renders_archive_html_and_text
    data = snapshot
    result = Speedshop::FourLineArchiveGenerator.generate(lines: data.fetch("archive"), generated_at: data.fetch("generated_at"))
    assert_equal 1, result["issue_count"]
    assert_equal 4, result["line_count"]
    linked_line = result["lines"].find { |line| line["line_text"] == "Second public line with a link." }
    refute_nil linked_line
    assert_match(/^2026-01-17-/, linked_line["id"])
    assert_includes linked_line["line_html"], '<a href="https://example.com/"'
  end

  def test_generate_discards_executable_content_and_attributes
    html = Speedshop::FourLineArchiveGenerator.markdown_to_inline_html('<script>alert(1)</script><svg onload="alert(2)"></svg><a href="https://example.com" onclick="alert(3)">link</a>')
    refute_match(/script|svg|onclick|alert/, html)
    assert_includes html, 'href="https://example.com"'
  end

  def test_generate_discards_unsafe_link_schemes
    html = Speedshop::FourLineArchiveGenerator.markdown_to_inline_html("[bad](javascript:alert%281%29) and **good**")
    refute_includes html, "javascript:"
    assert_includes html, "<strong>good</strong>"
  end
end
