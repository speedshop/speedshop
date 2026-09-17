require "minitest/autorun"
require "jekyll"
require "ostruct"
require "tmpdir"
require "fileutils"
require_relative "../../_plugins/pandoc_cache"

class PandocCacheTest < Minitest::Test
  class Cache < Speedshop::PandocCache
    def initialize(site)
      @data_directory = File.join(site.source, "pandoc-data")
      super
    end

    private

    def command(*args)
      (args.first == "kpsewhich") ? "" : "converter version 1\nUser data directory: #{@data_directory}\n"
    end
  end

  def setup
    @directory = Dir.mktmpdir
    @previous_cache_dir = Jekyll::Cache.cache_dir
    Jekyll::Cache.cache_dir = File.join(@directory, "cache")
    Jekyll::Cache.new("Speedshop::Pandoc").clear
    Jekyll::Cache.new("Speedshop::PandocDependencies").clear
    @site = OpenStruct.new(source: @directory, dest: File.join(@directory, "site"), static_files: [])
    %w[_plugins _pandoc site/assets pandoc-data].each { |path| FileUtils.mkdir_p(File.join(@directory, path)) }
    File.write(File.join(@directory, "_plugins/pandoc_converter.rb"), "converter")
    @filter = File.join(@directory, "_pandoc/filter.lua")
    @image = File.join(@site.dest, "assets/image.svg")
    @input = File.join(@site.dest, "index.html")
    @output = File.join(@site.dest, "index.pdf")
    File.write(@filter, "filter")
    File.write(@image, "image one")
    File.write(@input, "<h1>Original</h1>")
    @conversions = 0
  end

  def teardown
    Jekyll::Cache.new("Speedshop::Pandoc").clear
    Jekyll::Cache.new("Speedshop::PandocDependencies").clear
    Jekyll::Cache.cache_dir = @previous_cache_dir
    FileUtils.remove_entry(@directory)
  end

  def test_reuses_output_after_destination_is_deleted
    convert
    File.delete(@output)
    convert
    assert_equal 1, @conversions
    assert_equal "converted 1", File.read(@output)
  end

  def test_invalidates_changed_html
    convert
    File.write(@input, "<h1>Changed</h1>")
    convert
    assert_equal 2, @conversions
  end

  def test_invalidates_same_size_resource_edit_even_with_restored_mtime
    convert
    mtime = File.mtime(@image)
    File.write(@image, "image two")
    File.utime(mtime, mtime, @image)
    convert
    assert_equal 2, @conversions
  end

  def test_invalidates_changed_filter
    convert
    File.write(@filter, "new filter")
    convert
    assert_equal 2, @conversions
  end

  def test_invalidates_removed_resource
    convert
    File.delete(@image)
    convert
    assert_equal 2, @conversions
  end

  def test_invalidates_added_changed_and_removed_pandoc_defaults
    convert
    stylesheet = File.join(@directory, "pandoc-data", "epub.css")
    File.write(stylesheet, "body { color: red; }")
    convert
    assert_equal 2, @conversions
    File.write(stylesheet, "body { color: blue; }")
    convert
    assert_equal 3, @conversions
    File.delete(stylesheet)
    File.delete(@output)
    convert
    assert_equal 3, @conversions
    assert_equal "converted 1", File.read(@output)
  end

  def test_recovers_from_truncated_disk_entries
    convert
    %w[Speedshop::Pandoc Speedshop::PandocDependencies].each do |name|
      Jekyll::Cache.base_cache.fetch(name).clear
      directory = name.gsub(/[^\w\s-]/, "-")
      Dir[File.join(Jekyll::Cache.cache_dir, directory, "**", "*")].select { |path| File.file?(path) }.each do |path|
        File.binwrite(path, "\x04\x08\"")
      end
    end
    File.delete(@output)
    convert
    assert_equal 2, @conversions
    assert_equal "converted 2", File.read(@output)
  end

  def test_failed_conversion_is_not_cached
    cache = Cache.new(@site)
    refute cache.fetch(@input, @output) { false }
    convert
    assert_equal 1, @conversions
    assert_equal "converted 1", File.read(@output)
  end

  private

  def convert
    Cache.new(@site).fetch(@input, @output) do
      @conversions += 1
      File.write(@output, "converted #{@conversions}")
      true
    end
  end
end
