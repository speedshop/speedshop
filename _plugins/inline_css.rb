module Jekyll
  class InlineCSSTag < Liquid::Tag
    def initialize(tag_name, path, tokens)
      super
      @path = path.strip
    end

    def render(context)
      site_dest = context.registers[:site].dest
      full_path = File.join(site_dest, @path)
      File.exist?(full_path) ? File.read(full_path) : "/* CSS file not found: #{@path} */"
    end
  end
end

Liquid::Template.register_tag('inline_css', Jekyll::InlineCSSTag)
