module Jekyll
  class RenderMarginNoteTag < Liquid::Tag
    def initialize(tag_name, params, tokens)
      super
      @params = params.split("|").map(&:strip)
    end

    def render(context)
      raw_path = @params[0]
      # Determine the full image source URL
      img_src = if raw_path.match(/^https?:/)
        # Already a full URL
        raw_path
      elsif raw_path.start_with?("/")
        # Already an absolute path, use site URL + path
        "#{context.registers[:site].config["url"]}#{raw_path}"
      else
        # Relative path, prepend the assets/posts/img directory
        "#{context.registers[:site].config["url"]}/assets/posts/img/#{raw_path}"
      end
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
