module Jekyll
  class ImageInfo
    PNG_SIGNATURE = "\x89PNG\r\n\x1a\n".b
    JPEG_SOF_MARKERS = [
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

    def self.dimensions(site, input)
      path = input.to_s
      return nil if path.empty? || remote_url?(path) || !site

      full_path = File.join(site.source, path.sub(%r{\A/}, ""))
      return nil unless File.exist?(full_path)

      read_dimensions(full_path)
    end

    def self.mime_type(input)
      path = input.to_s.split("?", 2).first.downcase
      MIME_TYPES[File.extname(path)]
    end

    def self.share_path(input)
      path = input.to_s.strip
      return "/assets/img/opengraph.jpg" if path.empty?
      return path if remote_url?(path) || path.start_with?("/")
      return "/#{path}" if path.include?("/")

      "/assets/posts/img/#{path}"
    end

    def self.read_dimensions(path)
      File.open(path, "rb") do |io|
        signature = io.read(8)
        return png_dimensions(io) if signature == PNG_SIGNATURE

        io.rewind
        return jpeg_dimensions(io) if io.read(2) == "\xFF\xD8".b
      end
      nil
    rescue
      nil
    end
    private_class_method :read_dimensions

    def self.remote_url?(path)
      path.start_with?("http://", "https://")
    end
    private_class_method :remote_url?

    def self.png_dimensions(io)
      io.read(8) # chunk length + type
      dims = io.read(8)
      return nil unless dims && dims.bytesize == 8

      dims.unpack("NN")
    end
    private_class_method :png_dimensions

    def self.jpeg_dimensions(io)
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

        if JPEG_SOF_MARKERS.include?(marker_value)
          io.read(1) # precision
          height, width = io.read(4).unpack("nn")
          return [width, height]
        end

        io.seek(segment_length, IO::SEEK_CUR)
      end
    end
    private_class_method :jpeg_dimensions
  end
end
