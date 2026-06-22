require "minitest/autorun"
require_relative "test_helper"

class HomeVisualizationTest < Minitest::Test
  def test_ttt_visualization_javascript_stays_under_ten_kilobytes
    bytes = File.size(File.join(TestHelper::ROOT_DIR, "assets/js/viz/ttt.js"))

    assert_operator bytes, :<=, 10 * 1024
  end

  def test_homepage_randomizes_ttt_visualization_with_existing_options
    html = File.read(File.join(TestHelper::SITE_DIR, "index.html"))

    %w[dazzle xerox ttt].each do |name|
      assert_includes html, "\"#{name}\""
    end
    assert_includes html, "new URLSearchParams(location.search).get(\"viz\")"
    assert_includes html, "Math.random() * vizOptions.length"
  end
end
