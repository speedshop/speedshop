require "minitest/autorun"
require "tmpdir"
require "ostruct"
require "liquid"

require_relative "../_plugins/image_dimensions"

class ImageDimensionsFilterTest < Minitest::Test
  def test_image_dimensions_default_is_empty
    Dir.mktmpdir do |dir|
      filter = build_filter(dir)
      path = File.join(dir, "sample.png")
      File.binwrite(path, png_bytes(12, 34))

      non_default = filter.image_dimensions("/sample.png")
      refute_equal "", non_default

      result = filter.image_dimensions("")
      assert_equal "", result
    end
  end

  def test_image_dimensions_returns_dimensions_for_png
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "sample.png"), png_bytes(90, 120))
      result = build_filter(dir).image_dimensions("/sample.png")
      assert_equal "width=\"90\" height=\"120\"", result
    end
  end

  def test_image_dimensions_returns_dimensions_for_gif
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "sample.gif"), gif_bytes(64, 32))
      result = build_filter(dir).image_dimensions("/sample.gif")
      assert_equal "width=\"64\" height=\"32\"", result
    end
  end

  def test_image_dimensions_returns_dimensions_for_jpeg
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "sample.jpg"), jpeg_bytes(48, 24))
      result = build_filter(dir).image_dimensions("/sample.jpg")
      assert_equal "width=\"48\" height=\"24\"", result
    end
  end

  def test_image_dimensions_returns_empty_for_missing_file
    Dir.mktmpdir do |dir|
      result = build_filter(dir).image_dimensions("/missing.png")
      assert_equal "", result
    end
  end

  def test_image_dimensions_returns_empty_for_remote_url
    Dir.mktmpdir do |dir|
      result = build_filter(dir).image_dimensions("https://example.com/test.png")
      assert_equal "", result
    end
  end

  private

  def build_filter(site_source)
    filter = Object.new.extend(Jekyll::ImageDimensionsFilter)
    context = Liquid::Context.new({}, {}, { site: OpenStruct.new(source: site_source) })
    filter.instance_variable_set(:@context, context)
    filter
  end

  def png_bytes(width, height)
    signature = "\x89PNG\r\n\x1a\n".b
    ihdr_header = [13].pack("N") + "IHDR"
    dims = [width, height].pack("NN")
    signature + ihdr_header + dims
  end

  def gif_bytes(width, height)
    "GIF89a".b + [width, height].pack("vv")
  end

  def jpeg_bytes(width, height)
    [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x07, 0x08].pack("C*") +
      [height, width].pack("nn")
  end
end
