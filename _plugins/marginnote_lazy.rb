module Jekyll
  class RenderMarginNoteTag < Liquid::Tag
    def initialize(tag_name, params, tokens)
      super
      @params = params.split("|").map(&:strip)
    end

    def render(context)
      img_src = @params[0].match(/http/) ? @params[0] : "#{context.registers[:site].config["url"]}/assets/posts/img/#{@params[0]}"
      caption = @params[1]
      klass = @params[2] == "true" ? "no-mobile" : ""
      output =  "<span class='marginnote #{klass}'>"
      output += "<img src='#{img_src}' loading='lazy'>"
      output += "<br>#{caption}"
      output += "</span>"
      output
    end
  end
end

Liquid::Template.register_tag('marginnote_lazy', Jekyll::RenderMarginNoteTag)
