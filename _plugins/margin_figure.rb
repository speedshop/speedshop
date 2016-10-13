## Liquid tag 'maincolumn' used to add image data that fits within the main column
## area of the layout
## Usage {% marginfigure /path/to/image 'This is the caption' 'classes' %}
#
module Jekyll
  class RenderMarginFigureTag < Liquid::Tag

  	require "shellwords"

    def initialize(tag_name, text, tokens)
      super
      @text = text.shellsplit
    end

    def render(context)
      "<span class='marginnote #{@text[2]}'><img class='b-lazy} src='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' data-src='#{@text[0]}'/><br>#{@text[1]}</span>"
    end
  end
end

Liquid::Template.register_tag('marginfigure', Jekyll::RenderMarginFigureTag)
