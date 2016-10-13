module Jekyll
  class MarginNoteBlock < Liquid::Block
    require "shellwords"
    attr_accessor :text
    
    def initialize(tag_name, text, tokens)
      super
      @text = text.shellsplit
    end

    def render(context)
      "<div class='marginnote #{text[0]}'>#{super}</div> "
    end
  end
end

Liquid::Template.register_tag('marginnote_block', Jekyll::MarginNoteBlock)
