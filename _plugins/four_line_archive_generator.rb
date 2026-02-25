require "digest"
require "kramdown"
require "nokogiri"
require "date"
require "time"

module Speedshop
  module FourLineArchiveGenerator
    ARCHIVE_CANDIDATES = [
      File.join("speedshop", "lines", "archive"),
      File.join("lines", "archive")
    ].freeze
    NUMBERED_LINE = /^\s*\d+\.\s+(.+?)\s*$/

    module_function

    def default_payload
      {
        "generated_at" => "1970-01-01T00:00:00Z",
        "issue_count" => 0,
        "line_count" => 0,
        "lines" => []
      }
    end

    def generate(client_notes_path:)
      archive_dir = find_archive_dir(client_notes_path)
      return default_payload unless archive_dir

      today = Date.today.to_s
      lines = Dir.glob(File.join(archive_dir, "*.md")).sort.reverse.flat_map do |path|
        issue_date = File.basename(path, ".md").tr("_", "-")
        next [] if issue_date > today
        extract_lines(path)
      end

      {
        "generated_at" => Time.now.utc.iso8601,
        "issue_count" => lines.map { |line| line["issue_date"] }.uniq.count,
        "line_count" => lines.count,
        "lines" => lines
      }
    end

    def find_archive_dir(client_notes_path)
      return nil unless client_notes_path

      ARCHIVE_CANDIDATES
        .map { |relative| File.join(client_notes_path, relative) }
        .find { |path| Dir.exist?(path) }
    end

    def extract_lines(path)
      issue_date = File.basename(path, ".md").tr("_", "-")

      File.readlines(path, chomp: true).filter_map do |line|
        match = line.match(NUMBERED_LINE)
        next unless match

        markdown = match[1].strip
        html = markdown_to_inline_html(markdown)

        {
          "id" => "#{issue_date}-#{Digest::SHA1.hexdigest(markdown)[0, 12]}",
          "issue_date" => issue_date,
          "line_markdown" => markdown,
          "line_html" => html,
          "line_text" => html_to_text(html)
        }
      end
    end

    def markdown_to_inline_html(markdown)
      html = Kramdown::Document.new(markdown).to_html.strip
      html.delete_prefix("<p>").delete_suffix("</p>")
    end

    def html_to_text(html)
      Nokogiri::HTML::DocumentFragment.parse(html).text.strip
    end
  end
end
