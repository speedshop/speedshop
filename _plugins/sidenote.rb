module Jekyll
  class RenderSideNoteTag < Liquid::Tag

    require "shellwords"

    def initialize(tag_name, text, tokens)
      super
      @text = text.shellsplit
    end

    def render(context)
      output = ""
      if @text[0].to_i.to_s == @text[0]
        output += "<sup class='sidenote-number'>"
        output += "#{@text[0]}</sup>"
        output += "<span class='sidenote-parens'> (#{@text[1]})</span>"
        output += "<span class='sidenote'>"
        output += "<sup class='sidenote-number'>#{@text[0]}</sup> #{@text[1]}</span>"
      else
        output += "<span class='sidenote-parens'> (#{@text[0]})</span>"
        output += "<span class='sidenote'>#{@text[0]}</span>"
      end
    end
  end
end

Liquid::Template.register_tag('sidenote', Jekyll::RenderSideNoteTag)
