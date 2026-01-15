require "minitest/autorun"
require "liquid"

require_relative "../../_plugins/sidenote"

class SidenoteTagTest < Minitest::Test
  def test_render_default_is_unnumbered_sidenote
    numbered_output = render_tag("1 'This is a numbered sidenote'")
    refute_equal render_tag("'This is a test'"), numbered_output

    result = render_tag("'Simple text'")
    assert_includes result, "sidenote-parens"
    assert_includes result, "Simple text"
    refute_includes result, "sidenote-number"
  end

  def test_render_with_number_includes_sidenote_number
    result = render_tag("1 'This is a numbered sidenote'")

    assert_includes result, "<sup class='sidenote-number'>1</sup>"
    assert_includes result, "This is a numbered sidenote"
    assert_includes result, "<span class='sidenote'>"
  end

  def test_render_without_number_excludes_sidenote_number
    result = render_tag("'This is an unnumbered sidenote'")

    refute_includes result, "sidenote-number"
    assert_includes result, "This is an unnumbered sidenote"
    assert_includes result, "<span class='sidenote'>"
  end

  def test_render_parens_shows_text_in_parentheses
    result = render_tag("'Parenthetical text'")

    assert_includes result, "<span class='sidenote-parens'> (Parenthetical text)</span>"
  end

  def test_render_numbered_parens_shows_text_in_parentheses
    result = render_tag("42 'Numbered parens'")

    assert_includes result, "<span class='sidenote-parens'> (Numbered parens)</span>"
  end

  private

  def render_tag(params)
    Liquid::Template.parse("{% sidenote #{params} %}").render
  end
end
