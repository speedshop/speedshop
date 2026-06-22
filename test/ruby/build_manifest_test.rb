require "minitest/autorun"
require "open3"
require "rexml/document"
require_relative "test_helper"

class BuildManifestTest < Minitest::Test
  ROOT_DIR = File.expand_path("../..", __dir__)
  SITE_DIR = TestHelper::SITE_DIR
  MANIFEST_PATH = File.expand_path("../fixtures/build_manifest.txt", __dir__)

  def setup
    TestHelper.ensure_site_built!
  end

  def test_sitemap_static_pages_unchanged
    sitemap_path = File.join(SITE_DIR, "sitemap.xml")

    doc = REXML::Document.new(File.read(sitemap_path))
    urls = doc.elements.collect("urlset/url/loc") { |e| e.text }

    actual = urls
      .reject { |url| url.match?(%r{/blog/[^/]+/$}) }
      .map { |url| normalize_sitemap_url(url) }
      .sort
    expected = manifest[:sitemap].sort

    assert_equal expected, actual,
      "Sitemap static pages changed. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Added: #{(actual - expected).inspect}\n" \
      "Removed: #{(expected - actual).inspect}"
  end

  def test_root_level_files_unchanged
    entries = root_entries
    actual = entries.reject { |e| File.directory?(File.join(SITE_DIR, e)) }.sort

    unexpected = actual - allowed_root_files

    assert_empty unexpected,
      "Unexpected files at _site root. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Unexpected: #{unexpected.inspect}"
  end

  def test_root_level_directories_unchanged
    entries = root_entries
    actual = entries.select { |e| File.directory?(File.join(SITE_DIR, e)) }.sort
    expected = manifest[:directories].sort

    unexpected = actual - expected

    assert_empty unexpected,
      "Unexpected directories at _site root. Update test/fixtures/build_manifest.txt if intentional.\n" \
      "Unexpected: #{unexpected.inspect}"
  end

  def test_no_missing_expected_content
    entries = root_entries

    manifest[:directories].each do |dir|
      assert entries.include?(dir), "Expected directory '#{dir}' not found in _site root"
    end

    manifest[:pages].each do |page|
      %w[.html .md .pdf .epub].each do |ext|
        assert entries.include?("#{page}#{ext}"), "Expected page variant '#{page}#{ext}' not found in _site root"
      end
    end

    manifest[:files].each do |file|
      assert entries.include?(file), "Expected file '#{file}' not found in _site root"
    end
  end

  def test_forbidden_paths_absent
    manifest[:forbidden_paths].each do |path|
      refute File.exist?(File.join(SITE_DIR, path.delete_suffix("/"))),
        "Forbidden deploy artifact '#{path}' found in _site"
    end
  end

  private

  def root_entries
    Dir.entries(SITE_DIR).reject do |entry|
      entry.start_with?(".") || ignored_root_entries.include?(entry) && !expected_root_entries.include?(entry)
    end
  end

  def manifest
    @manifest ||= parse_manifest
  end

  def parse_manifest
    result = {directories: [], pages: [], files: [], forbidden_paths: [], sitemap: []}
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
      when :forbidden_paths
        result[:forbidden_paths] << line
      when :sitemap
        result[:sitemap] << line
      end
    end

    result
  end

  def normalize_sitemap_url(url)
    url
      .sub("https://localhost:4000", "https://www.speedshop.co")
      .sub("https://127.0.0.1:4000", "https://www.speedshop.co")
  end

  def ignored_root_entries
    @ignored_root_entries ||= begin
      stdout, status = Open3.capture2(
        "git", "status", "--porcelain", "--ignored", "--untracked-files=normal", "--", ".",
        chdir: ROOT_DIR
      )
      raise "Failed to list ignored source paths" unless status.success?

      stdout.lines.filter_map do |line|
        next unless line.start_with?("?? ", "!! ")

        path = line[3..].strip
        next if path.delete_suffix("/").include?("/")

        path.delete_suffix("/")
      end.uniq
    end
  end

  def allowed_root_files
    allowed = []

    manifest[:pages].each do |page|
      %w[.html .md .pdf .epub].each { |ext| allowed << "#{page}#{ext}" }
    end

    allowed + manifest[:files]
  end

  def expected_root_entries
    @expected_root_entries ||= manifest[:directories] + allowed_root_files
  end
end
