module Jekyll
  class RenderMarginNoteTag < Liquid::Tag
    def initialize(tag_name, params, tokens)
      super
      @params = params.split("|").map(&:strip)
    end

    def render(context)
      img_src = @params[0].match(/http/) ? @params[0] : "/assets/posts/img/#{@params[0]}"
      caption = @params[1]
      klass = @params[2] == "true" ? "no-mobile" : ""
      output =  "<span class='marginnote #{klass}'>"
      output += "<img src='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' data-src='#{img_src}' class='b-lazy'>"
      output += "<noscript><img src='#{img_src}'></noscript>"
      output += "<br>#{caption}"
      output += "</span>"
      output
    end
  end
end

Liquid::Template.register_tag('marginnote_lazy', Jekyll::RenderMarginNoteTag)
