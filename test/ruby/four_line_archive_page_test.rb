require "minitest/autorun"
require "jekyll"
require "nokogiri"

class FourLineArchivePageTest < Minitest::Test
  def test_renders_entries_and_permalinks_without_javascript
    source = File.read(File.expand_path("../../pages/four-line-fridays.html", __dir__))
    list_template = source[/<ul class="four-line-results".*?<\/ul>/m]
    line = {
      "id" => "2026-01-02-example",
      "issue_date" => "2026-01-02",
      "line_html" => '<a href="https://example.com/">Ruby &amp; Rails</a> "notes"',
      "line_text" => 'Ruby & Rails "notes"'
    }
    html = Liquid::Template.parse(list_template).render!("lines" => [line])
    document = Nokogiri::HTML.fragment(html)
    entry = document.at_css("li")

    assert_equal line["id"], entry["id"]
    assert_equal 'ruby & rails "notes" 2026-01-02', entry["data-search"]
    assert_equal "Jan 2, 2026", entry.at_css(".four-line-meta").text
    assert_equal "https://example.com/", entry.at_css(".four-line-text a")["href"]
    permalink = entry.at_css(".four-line-permalink")
    assert_equal "##{line["id"]}", permalink["href"]
    assert_equal "#", permalink.text
  end
end
