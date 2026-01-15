require "minitest/autorun"
require "ostruct"
require "liquid"

require_relative "../_plugins/marginnote_lazy"

class MarginnotelazyTagTest < Minitest::Test
  def test_render_default_includes_marginnote_span
    result = render_tag("test.png | A caption")

    assert_includes result, "<span class='marginnote "
    assert_includes result, "</span>"
  end

  def test_render_with_relative_path_prepends_assets_directory
    result = render_tag("test.png | A caption")

    assert_includes result, "https://example.com/assets/posts/img/test.png"
  end

  def test_render_with_absolute_path_uses_site_url
    result = render_tag("/images/test.png | A caption")

    assert_includes result, "https://example.com/images/test.png"
    refute_includes result, "/assets/posts/img/"
  end

  def test_render_with_full_url_preserves_url
    result = render_tag("https://cdn.example.org/image.png | A caption")

    assert_includes result, "https://cdn.example.org/image.png"
    refute_includes result, "example.com"
  end

  def test_render_includes_caption
    result = render_tag("test.png | This is the caption text")

    assert_includes result, "<br>This is the caption text"
  end

  def test_render_includes_lazy_loading
    result = render_tag("test.png | A caption")

    assert_includes result, "loading='lazy'"
  end

  def test_render_with_no_mobile_flag_adds_class
    result = render_tag("test.png | A caption | true")

    assert_includes result, "class='marginnote no-mobile'"
  end

  def test_render_without_no_mobile_flag_excludes_class
    result = render_tag("test.png | A caption")

    refute_includes result, "no-mobile"
  end

  private

  def render_tag(params)
    template = Liquid::Template.parse("{% marginnote_lazy #{params} %}")
    template.render({}, registers: {site: OpenStruct.new(config: {"url" => "https://example.com"})})
  end
end
