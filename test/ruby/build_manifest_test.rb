require "minitest/autorun"
require "rexml/document"
require_relative "test_helper"

class BuildManifestTest < Minitest::Test
  SITE_DIR = File.expand_path("../../_site", __dir__)
  MANIFEST_PATH = File.expand_path("../fixtures/build_manifest.txt", __dir__)

  def test_sitemap_static_pages_unchanged
    sitemap_path = File.join(SITE_DIR, "sitemap.xml")

    doc = REXML::Document.new(File.read(sitemap_path))
    urls = doc.elements.collect("urlset/url/loc") { |e| e.text }

    actual = urls.reject { |url| url.match?(%r{/blog/[^/]+/$}) }.sort
    expected = manifest[:sitemap].sort

    assert_equal expected, actual,
      "Sitemap static pages changed. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Added: #{(actual - expected).inspect}\n" \
      "Removed: #{(expected - actual).inspect}"
  end

  def test_root_level_files_unchanged
    entries = Dir.entries(SITE_DIR).reject { |e| e.start_with?(".") }
    actual = entries.reject { |e| File.directory?(File.join(SITE_DIR, e)) }.sort

    unexpected = actual - allowed_root_files

    assert_empty unexpected,
      "Unexpected files at _site root. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Unexpected: #{unexpected.inspect}"
  end

  def test_root_level_directories_unchanged
    entries = Dir.entries(SITE_DIR).reject { |e| e.start_with?(".") }
    actual = entries.select { |e| File.directory?(File.join(SITE_DIR, e)) }.sort
    expected = manifest[:directories].sort

    unexpected = actual - expected

    assert_empty unexpected,
      "Unexpected directories at _site root. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Unexpected: #{unexpected.inspect}"
  end

  def test_no_missing_expected_content
    entries = Dir.entries(SITE_DIR).reject { |e| e.start_with?(".") }

    manifest[:directories].each do |dir|
      assert entries.include?(dir), "Expected directory '#{dir}' not found in _site root"
    end

    manifest[:pages].each do |page|
      assert entries.include?("#{page}.html"), "Expected page '#{page}.html' not found in _site root"
    end

    manifest[:files].each do |file|
      assert entries.include?(file), "Expected file '#{file}' not found in _site root"
    end
  end

  private

  def manifest
    @manifest ||= parse_manifest
  end

  def parse_manifest
    result = {directories: [], pages: [], files: [], sitemap: []}
    current_section = nil

    File.readlines(MANIFEST_PATH).each do |line|
      line = line.strip
      next if line.empty? || line.start_with?("#")

      if line.match?(/^\[(\w+)\]$/)
        current_section = line[1..-2].to_sym
        next
      end

      case current_section
      when :directories
        result[:directories] << line.delete_suffix("/")
      when :pages
        result[:pages] << line.delete_suffix(".*")
      when :files
        result[:files] << line
      when :sitemap
        result[:sitemap] << line
      end
    end

    result
  end

  def allowed_root_files
    allowed = []

    manifest[:pages].each do |page|
      %w[.html .md .pdf .epub].each { |ext| allowed << "#{page}#{ext}" }
    end

    allowed + manifest[:files]
  end
end
