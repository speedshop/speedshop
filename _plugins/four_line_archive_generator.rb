require "digest"
require "kramdown"
require "nokogiri"

module Speedshop
  module FourLineArchiveGenerator
    module_function

    def generate(lines:, generated_at:)
      ordered = lines.group_by { |line| line.fetch("issue_date") }.sort.reverse.flat_map(&:last)
      rendered = ordered.map do |line|
        markdown = line.fetch("markdown")
        date = line.fetch("issue_date")
        html = markdown_to_inline_html(markdown)
        {
          "id" => "#{date}-#{Digest::SHA1.hexdigest(markdown)[0, 12]}",
          "issue_date" => date,
          "line_markdown" => markdown,
          "line_html" => html,
          "line_text" => Nokogiri::HTML::DocumentFragment.parse(html).text.strip
        }
      end
      {
        "generated_at" => generated_at,
        "issue_count" => rendered.map { |line| line["issue_date"] }.uniq.count,
        "line_count" => rendered.count,
        "lines" => rendered
      }
    end

    def markdown_to_inline_html(markdown)
      fragment = Nokogiri::HTML::DocumentFragment.parse(Kramdown::Document.new(markdown).to_html)
      fragment.css("script, style, iframe, object, embed, svg, math, template").remove
      fragment.traverse do |node|
        next unless node.element?

        unless %w[a em strong code del s br].include?(node.name)
          node.replace(node.children)
          next
        end
        href = node["href"]
        node.attribute_nodes.each(&:remove)
        if node.name == "a" && href&.match?(/\Ahttps?:\/\/[^\s\x00-\x1f]+\z/i)
          node["href"] = href
          node["rel"] = "noopener noreferrer"
        end
      end
      fragment.to_html.strip
    end
  end
end
