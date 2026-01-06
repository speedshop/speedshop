require "nokogiri"

module Jekyll
  module TocFilter
    def toc(content)
      return "" if content.nil? || content.empty?

      headers = extract_headers(content)
      return "" if headers.empty?

      build_toc(headers)
    end

    def header_anchors(content)
      return content if content.nil? || content.empty?

      doc = Nokogiri::HTML.fragment(content)
      doc.css('h2[id], h3[id], h4[id]').each do |header|
        anchor = Nokogiri::XML::Node.new('a', doc)
        anchor['href'] = "##{header['id']}"
        anchor['class'] = 'header-anchor'
        anchor.content = '#'
        header.add_child(' ')
        header.add_child(anchor)
      end
      doc.to_html
    end

    private

    def extract_headers(content)
      headers = []
      content.scan(/<h([2-4])[^>]*id="([^"]+)"[^>]*>(.*?)<\/h\1>/mi) do |level, id, text|
        clean_text = text.gsub(/<[^>]+>/, "").strip
        headers << { level: level.to_i, id: id, text: clean_text }
      end
      headers
    end

    def build_toc(headers)
      return "" if headers.empty?

      output = %(<nav class="toc">\n)
      output << %(<h4>Contents</h4>\n)
      output << %(<ol>\n)

      current_level = 2
      headers.each do |header|
        level = header[:level]

        while level > current_level
          output << %(<ol>\n)
          current_level += 1
        end

        while level < current_level
          output << %(</ol>\n)
          current_level -= 1
        end

        output << %(<li><a href="##{header[:id]}">#{header[:text]}</a></li>\n)
      end

      while current_level > 2
        output << %(</ol>\n)
        current_level -= 1
      end

      output << %(</ol>\n)
      output << %(</nav>\n)
      output
    end
  end
end

Liquid::Template.register_filter(Jekyll::TocFilter)
