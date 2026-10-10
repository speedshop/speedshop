require "json"
require "minitest/autorun"
require "tmpdir"

require_relative "../../_plugins/sla_reply_histogram"

class SlaReplyHistogramTest < Minitest::Test
  def test_generate_writes_svg_from_aggregate_data
    stats = {
      "count" => 1, "bin_width_hours" => 1, "max_hours" => 0.25,
      "percentiles" => {"p50" => 0.25, "p75" => 0.25, "p95" => 0.25, "p99" => 0.25},
      "bins" => [{"lower" => 0, "upper" => 1, "width" => 1, "count" => 1}]
    }
    Dir.mktmpdir do |dir|
      output_path = File.join(dir, "histogram.svg")
      assert_equal stats, Speedshop::SlaReplyHistogram.generate(stats: stats, output_path: output_path)
      assert_includes File.read(output_path), "<svg"
      assert_includes File.read(output_path), "p50"
    end
  end

  def test_render_empty_histogram
    snapshot = JSON.parse(File.read(File.expand_path("../fixtures/generated_data/snapshot.json", __dir__)))
    svg = Speedshop::SlaReplyHistogram.render_svg(stats: snapshot.fetch("reply_histogram"))
    assert_includes svg, "histogram unavailable"
  end
end
