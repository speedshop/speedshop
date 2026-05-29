module Jekyll
  module ImageDimensionsFilter
    PNG_SIGNATURE = "\x89PNG\r\n\x1a\n".b
    SOF_MARKERS = [
      0xC0, 0xC1, 0xC2, 0xC3,
      0xC5, 0xC6, 0xC7,
      0xC9, 0xCA, 0xCB,
      0xCD, 0xCE, 0xCF
    ].freeze

    MIME_TYPES = {
      ".gif" => "image/gif",
      ".jpg" => "image/jpeg",
      ".jpeg" => "image/jpeg",
      ".png" => "image/png",
      ".webp" => "image/webp"
    }.freeze

    def image_dimensions(input)
      width, height = dimensions_for(input)
      return "" unless width && height

      "width=\"#{width}\" height=\"#{height}\""
    end

    def image_width(input)
      dimensions_for(input)&.first
    end

    def image_height(input)
      dimensions_for(input)&.last
    end

    def image_mime_type(input)
      path = input.to_s.split("?", 2).first.downcase
      MIME_TYPES[File.extname(path)]
    end

    def share_image_path(input)
      path = input.to_s.strip
      return "/assets/img/opengraph.jpg" if path.empty?
      return path if remote_url?(path) || path.start_with?("/")
      return "/#{path}" if path.include?("/")

      "/assets/posts/img/#{path}"
    end

    private

    def dimensions_for(input)
      path = input.to_s
      return nil if path.empty? || remote_url?(path)

      site = @context.registers[:site]
      full_path = File.join(site.source, path.sub(%r{\A/}, ""))
      return nil unless File.exist?(full_path)

      read_dimensions(full_path)
    end

    def remote_url?(path)
      path.start_with?("http://", "https://")
    end

    def read_dimensions(path)
      File.open(path, "rb") do |io|
        header = io.read(10)
        return gif_dimensions(header) if header&.start_with?("GIF")

        io.rewind
        signature = io.read(8)
        return png_dimensions(io) if signature == PNG_SIGNATURE

        io.rewind
        return jpeg_dimensions(io) if io.read(2) == "\xFF\xD8".b
      end
      nil
    rescue
      nil
    end

    def gif_dimensions(header)
      return nil unless header && header.bytesize >= 10

      width, height = header[6, 4].unpack("vv")
      [width, height]
    end

    def png_dimensions(io)
      io.read(8) # chunk length + type
      dims = io.read(8)
      return nil unless dims && dims.bytesize == 8

      dims.unpack("NN")
    end

    def jpeg_dimensions(io)
      loop do
        marker_prefix = io.read(1)
        return nil unless marker_prefix
        next unless marker_prefix.ord == 0xFF

        marker = io.read(1)
        return nil unless marker

        marker_value = marker.ord
        marker_value = io.read(1).ord while marker_value == 0xFF
        next if marker_value == 0xD8 || marker_value == 0xD9

        length_bytes = io.read(2)
        return nil unless length_bytes && length_bytes.bytesize == 2

        segment_length = length_bytes.unpack1("n") - 2
        return nil if segment_length < 0

        if SOF_MARKERS.include?(marker_value)
          io.read(1) # precision
          height, width = io.read(4).unpack("nn")
          return [width, height]
        end

        io.seek(segment_length, IO::SEEK_CUR)
      end
    end
  end
end

Liquid::Template.register_filter(Jekyll::ImageDimensionsFilter)
