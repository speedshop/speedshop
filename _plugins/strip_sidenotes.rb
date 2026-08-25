module Jekyll
  module StripSidenotesFilter
    def strip_sidenotes(input)
      return input if input.nil?

      input
        .gsub(/<span\s+class=['"]sidenote['"]\s*>.*?<\/span\s*>/m, "")
        .gsub(/<span\s+class=['"]sidenote-parens['"]\s*>\s*\((.*?)\)\s*<\/span\s*>/m, ' (\1)')
        .gsub(/<sup\s+class=['"]sidenote-number['"]\s*>.*?<\/sup\s*>/m, "")
    end
  end
end

Liquid::Template.register_filter(Jekyll::StripSidenotesFilter)
