module Jekyll
  class RenderSideNoteTag < Liquid::Tag

    require "shellwords"

    def initialize(tag_name, text, tokens)
      super
      @text = text.shellsplit
    end

    def render(context)
      output = "<sup class='sidenote-number'>"
      output += "#{@text[0]}</sup>"
      output += "<span class='sidenote-parens'>(#{@text[1]})</span>"
      output += "<span class='sidenote'>"
      output += "<sup class='sidenote-number'>#{@text[0]}</sup> #{@text[1]}</span>"
    end
  end
end

Liquid::Template.register_tag('sidenote', Jekyll::RenderSideNoteTag)
