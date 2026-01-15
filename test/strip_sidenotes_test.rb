require "minitest/autorun"
require "liquid"

require_relative "../_plugins/strip_sidenotes"

class StripSidenotesFilterTest < Minitest::Test
  def test_strip_sidenotes_default_is_input_unchanged
    input_with_sidenote = "<p>Text<span class='sidenote'>Note</span></p>"
    stripped = build_filter.strip_sidenotes(input_with_sidenote)
    refute_equal input_with_sidenote, stripped

    result = build_filter.strip_sidenotes("Plain text without sidenotes")
    assert_equal "Plain text without sidenotes", result
  end

  def test_strip_sidenotes_removes_sidenote_spans
    input = "<p>Before<span class='sidenote'>Hidden note</span>After</p>"
    result = build_filter.strip_sidenotes(input)

    assert_equal "<p>BeforeAfter</p>", result
  end

  def test_strip_sidenotes_converts_parens_to_inline_parens
    input = "<p>Text<span class='sidenote-parens'> (note text)</span></p>"
    result = build_filter.strip_sidenotes(input)

    assert_equal "<p>Text (note text)</p>", result
  end

  def test_strip_sidenotes_handles_both_types_together
    input = "<p>Main<span class='sidenote-parens'> (parens)</span><span class='sidenote'>hidden</span></p>"
    result = build_filter.strip_sidenotes(input)

    assert_equal "<p>Main (parens)</p>", result
  end

  def test_strip_sidenotes_handles_multiline_sidenotes
    input = "<span class='sidenote'>Line one\nLine two</span>"
    result = build_filter.strip_sidenotes(input)

    assert_equal "", result
  end

  def test_strip_sidenotes_returns_nil_input_unchanged
    result = build_filter.strip_sidenotes(nil)

    assert_nil result
  end

  private

  def build_filter
    Object.new.extend(Jekyll::StripSidenotesFilter)
  end
end
