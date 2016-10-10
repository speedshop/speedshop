module Jekyll
  class MarginNoteBlock < Liquid::Block
    require "shellwords"

    def initialize(tag_name, markup, tokens)
      super
    end

    def render(context)
      "<div class='marginnote'>#{super}</div> "
    end
  end
end

Liquid::Template.register_tag('marginnote_block', Jekyll::MarginNoteBlock)
