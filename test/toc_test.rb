require "minitest/autorun"
require "liquid"

require_relative "../_plugins/toc"

class TocFilterTest < Minitest::Test
  def test_toc_default_is_empty_string
    content_with_headers = '<h2 id="intro">Intro</h2><p>Text</p>'
    toc = build_filter.toc(content_with_headers)
    refute_equal "", toc

    result = build_filter.toc("")
    assert_equal "", result
  end

  def test_toc_generates_nav_with_contents_heading
    content = '<h2 id="section">Section</h2>'
    result = build_filter.toc(content)

    assert_includes result, '<nav class="toc">'
    assert_includes result, "<h4>Contents</h4>"
    assert_includes result, "</nav>"
  end

  def test_toc_creates_links_to_headers
    content = '<h2 id="intro">Introduction</h2><h2 id="main">Main Content</h2>'
    result = build_filter.toc(content)

    assert_includes result, '<a href="#intro">Introduction</a>'
    assert_includes result, '<a href="#main">Main Content</a>'
  end

  def test_toc_handles_nested_headers
    content = '<h2 id="parent">Parent</h2><h3 id="child">Child</h3>'
    result = build_filter.toc(content)

    assert_includes result, '<a href="#parent">Parent</a>'
    assert_includes result, '<a href="#child">Child</a>'
  end

  def test_toc_returns_empty_for_content_without_headers
    result = build_filter.toc("<p>Just a paragraph</p>")

    assert_equal "", result
  end

  def test_toc_returns_empty_for_nil_content
    result = build_filter.toc(nil)

    assert_equal "", result
  end

  def test_header_anchors_default_is_content_unchanged
    content_with_id = '<h2 id="test">Test</h2>'
    anchored = build_filter.header_anchors(content_with_id)
    refute_equal content_with_id, anchored

    result = build_filter.header_anchors("<p>No headers</p>")
    assert_equal "<p>No headers</p>", result
  end

  def test_header_anchors_adds_anchor_links_to_headers_with_ids
    content = '<h2 id="section">Section Title</h2>'
    result = build_filter.header_anchors(content)

    assert_includes result, 'href="#section"'
    assert_includes result, 'class="header-anchor"'
    assert_includes result, ">#</a>"
  end

  def test_header_anchors_ignores_headers_without_ids
    content = "<h2>No ID Header</h2>"
    result = build_filter.header_anchors(content)

    refute_includes result, "header-anchor"
  end

  def test_header_anchors_handles_h3_and_h4
    content = '<h3 id="sub">Subsection</h3><h4 id="deep">Deep</h4>'
    result = build_filter.header_anchors(content)

    assert_includes result, 'href="#sub"'
    assert_includes result, 'href="#deep"'
  end

  def test_header_anchors_returns_empty_content_unchanged
    result = build_filter.header_anchors("")

    assert_equal "", result
  end

  def test_header_anchors_returns_nil_content_unchanged
    result = build_filter.header_anchors(nil)

    assert_nil result
  end

  private

  def build_filter
    Object.new.extend(Jekyll::TocFilter)
  end
end
