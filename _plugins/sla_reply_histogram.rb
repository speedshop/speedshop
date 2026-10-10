require "fileutils"

module Speedshop
  module SlaReplyHistogram
    DEFAULT_OUTPUT_PATH = File.join("assets", "generated", "sla-reply-histogram.svg")
    SLA_HOURS = 24

    module_function

    def generate(stats:, output_path:)
      FileUtils.mkdir_p(File.dirname(output_path))
      File.write(output_path, render_svg(stats: stats))
      stats
    end

    def render_svg(stats:)
      return render_empty_svg if stats.fetch("count").zero?

      bins = stats.fetch("bins")
      width = 900
      height = 420
      margin = {top: 92, right: 28, bottom: 64, left: 64}
      plot_width = width - margin.fetch(:left) - margin.fetch(:right)
      plot_height = height - margin.fetch(:top) - margin.fetch(:bottom)
      max_x = [bins.last.fetch("upper"), SLA_HOURS].max
      max_y = [bins.map { |bin| bin.fetch("count") }.max, 1].max
      bar_gap = 2

      x = lambda { |value| margin.fetch(:left) + (value.to_f / max_x * plot_width) }
      y = lambda { |value| margin.fetch(:top) + plot_height - (value.to_f / max_y * plot_height) }
      bar_width = [(plot_width / bins.length.to_f) - bar_gap, 1].max

      bars = bins.map do |bin|
        bar_height = plot_height - y.call(bin.fetch("count")) + margin.fetch(:top)
        <<~SVG.chomp
          <rect class="bar" x="#{format_number(x.call(bin.fetch("lower")) + (bar_gap / 2.0))}" y="#{format_number(y.call(bin.fetch("count")))}" width="#{format_number(bar_width)}" height="#{format_number(bar_height)}"><title>#{format_hours(bin.fetch("lower"))}–#{format_hours(bin.fetch("upper"))} hours: #{bin.fetch("count")}</title></rect>
        SVG
      end.join("\n    ")

      y_ticks = numeric_ticks(0, max_y, 5).map do |tick|
        tick_y = y.call(tick)
        <<~SVG.chomp
          <g class="tick"><line class="grid" x1="#{margin.fetch(:left)}" x2="#{width - margin.fetch(:right)}" y1="#{format_number(tick_y)}" y2="#{format_number(tick_y)}"/><text x="#{margin.fetch(:left) - 10}" y="#{format_number(tick_y + 4)}" text-anchor="end">#{tick}</text></g>
        SVG
      end.join("\n    ")

      x_ticks = x_tick_values(max_x, stats.fetch("bin_width_hours")).map do |tick|
        tick_x = x.call(tick)
        <<~SVG.chomp
          <g class="tick"><line class="axis-tick" x1="#{format_number(tick_x)}" x2="#{format_number(tick_x)}" y1="#{margin.fetch(:top) + plot_height}" y2="#{margin.fetch(:top) + plot_height + 6}"/><text x="#{format_number(tick_x)}" y="#{margin.fetch(:top) + plot_height + 24}" text-anchor="middle">#{format_hours(tick)}</text></g>
        SVG
      end.join("\n    ")

      markers = (stats.fetch("percentiles").to_a + [["SLA", SLA_HOURS]]).sort_by do |label, value|
        marker_hour_value(label, value)
      end
      marker_lines = markers.map do |label, value|
        line_x = x.call(marker_hour_value(label, value))
        marker_class = (label == "SLA") ? "sla-marker" : "percentile-marker"
        <<~SVG.chomp
          <line class="marker-line #{marker_class}" x1="#{format_number(line_x)}" x2="#{format_number(line_x)}" y1="#{margin.fetch(:top)}" y2="#{margin.fetch(:top) + plot_height}"/>
        SVG
      end.join("\n    ")
      marker_labels = markers.map do |label, value|
        label_x = x.call(marker_hour_value(label, value)).clamp(margin.fetch(:left) + 14, width - margin.fetch(:right) - 14)
        label_y = margin.fetch(:top) - 16
        label_class = (label == "SLA") ? "sla-label" : "percentile-label"
        <<~SVG.chomp
          <text class="marker-label #{label_class}" x="#{format_number(label_x)}" y="#{label_y}" text-anchor="middle">#{label}</text>
        SVG
      end.join("\n    ")

      <<~SVG
        <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 #{width} #{height}" width="#{width}" height="#{height}">
          <title id="title">Hours until reply histogram</title>
          <desc id="desc">Histogram of Japanese business hours between inbox log entries, with percentile markers for p50, p75, p95, p99, and the 24-hour SLA.</desc>
          #{svg_styles}
          <rect class="background" width="100%" height="100%" rx="12"/>
          #{y_ticks}
          <line class="axis" x1="#{margin.fetch(:left)}" x2="#{width - margin.fetch(:right)}" y1="#{margin.fetch(:top) + plot_height}" y2="#{margin.fetch(:top) + plot_height}"/>
          #{bars}
          #{marker_lines}
          #{marker_labels}
          #{x_ticks}
          <text class="axis-label" x="#{margin.fetch(:left) + (plot_width / 2.0)}" y="#{height - 20}" text-anchor="middle">Business hours until reply</text>
          <text class="axis-label" transform="translate(18 #{margin.fetch(:top) + (plot_height / 2.0)}) rotate(-90)" text-anchor="middle">Frequency</text>
        </svg>
      SVG
    end

    def render_empty_svg
      <<~SVG
        <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 900 260" width="900" height="260">
          <title id="title">Hours until reply histogram unavailable</title>
          <desc id="desc">No reply-time samples were available in the website snapshot.</desc>
          #{svg_styles}
          <rect class="background" width="100%" height="100%" rx="12"/>
          <text class="title" x="40" y="52">Hours until reply</text>
          <text class="empty" x="40" y="118">No reply-time samples were available in the website snapshot.</text>
        </svg>
      SVG
    end

    def svg_styles
      <<~SVG
        <style>
          .background { fill: #fff; }
          .title { fill: #222; font: 500 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .subtitle, .axis-label, .tick text, .empty { fill: #777; font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .axis { stroke: #444; stroke-width: 1.5; }
          .axis-tick { stroke: #444; }
          .grid { stroke: #eeeeee; stroke-width: 1; }
          .bar { fill: #222; opacity: 0.72; transition: fill 140ms ease, opacity 140ms ease; }
          .bar:hover { fill: #000; opacity: 1; }
          .marker-line { stroke: #d7d7d7; stroke-width: 2; stroke-dasharray: 6 7; pointer-events: none; }
          .sla-marker { stroke: #111; stroke-dasharray: 3 5; }
          .marker-label { fill: #555; font: 600 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .sla-label { fill: #111; font-weight: 700; }
          @media (prefers-color-scheme: dark) {
            .background { fill: #111; }
            .title { fill: #f5f5f5; }
            .subtitle, .axis-label, .tick text, .empty, .marker-label { fill: #aaa; }
            .axis, .axis-tick { stroke: #ccc; }
            .grid { stroke: #303030; }
            .bar { fill: #f5f5f5; opacity: 0.72; }
            .bar:hover { fill: #fff; opacity: 1; }
            .marker-line { stroke: #555; }
            .sla-marker { stroke: #f5f5f5; }
            .sla-label { fill: #f5f5f5; }
          }
        </style>
      SVG
    end

    def numeric_ticks(min, max, target_count)
      step = [(max.to_f / target_count).ceil, 1].max
      ticks = (min..max).step(step).to_a
      ticks << max unless ticks.last == max
      ticks.uniq
    end

    def x_tick_values(max_x, bin_width)
      tick_every = if bin_width < 12
        4
      elsif bin_width < 24
        8
      else
        bin_width
      end

      ticks = (0..max_x).step(tick_every).to_a
      ticks << max_x unless ticks.last == max_x
      ticks.uniq
    end

    def marker_hour_value(label, value)
      (label == "SLA") ? value : value.round
    end

    def format_hours(value)
      return "" if value.nil?

      rounded = value.round(1)
      (rounded % 1).zero? ? rounded.to_i.to_s : rounded.to_s
    end

    def format_number(value)
      format("%.2f", value).sub(/\.00\z/, "")
    end
  end
end
