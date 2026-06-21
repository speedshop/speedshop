require_relative "image_info"

module Jekyll
  module ImageDimensionsFilter
    def image_dimensions(input)
      width, height = ImageInfo.dimensions(site, input)
      return "" unless width && height

      "width=\"#{width}\" height=\"#{height}\""
    end

    def image_width(input)
      ImageInfo.dimensions(site, input)&.first
    end

    def image_height(input)
      ImageInfo.dimensions(site, input)&.last
    end

    def image_mime_type(input)
      ImageInfo.mime_type(input)
    end

    def share_image_path(input)
      ImageInfo.share_path(input)
    end

    private

    def site
      @context.registers[:site]
    end
  end
end

Liquid::Template.register_filter(Jekyll::ImageDimensionsFilter)
