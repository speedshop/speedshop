module Jekyll
  module ImageDimensionsFilter
    PNG_SIGNATURE = "\x89PNG\r\n\x1a\n".b
    SOF_MARKERS = [
      0xC0, 0xC1, 0xC2, 0xC3,
      0xC5, 0xC6, 0xC7,
      0xC9, 0xCA, 0xCB,
      0xCD, 0xCE, 0xCF
    ].freeze

    def image_dimensions(input)
      path = input.to_s
      return "" if path.empty? || path.start_with?("http://", "https://")

      site = @context.registers[:site]
      full_path = File.join(site.source, path.sub(%r{\A/}, ""))
      return "" unless File.exist?(full_path)

      width, height = read_dimensions(full_path)
      return "" unless width && height

      "width=\"#{width}\" height=\"#{height}\""
    end

    private

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
