require "minitest/autorun"
require "jekyll"
require "ostruct"
require "tmpdir"
require "fileutils"
require "open3"

require_relative "../../_plugins/prettier_format"

class PrettierFormatTest < Minitest::Test
  def test_failure_output_does_not_claim_success
    output = run_hook(prettier_exit_status: 1)

    assert_includes output, "❌ Prettier formatting failed"
    refute_includes output, "✨ Successfully formatted site assets"
  end

  def test_success_output_claims_success
    output = run_hook(prettier_exit_status: 0)

    assert_includes output, "✨ Successfully formatted site assets"
    refute_includes output, "❌ Prettier formatting failed"
  end

  def test_cached_formatter_matches_cli_after_content_and_config_changes
    root = File.expand_path("../..", __dir__)
    formatter = File.join(root, "_scripts", "format.mjs")
    cli = File.join(root, "node_modules", ".bin", "prettier")
    Dir.mktmpdir do |directory|
      site = File.join(directory, "site")
      cache = File.join(directory, "cache")
      FileUtils.mkdir_p(site)
      File.write(File.join(directory, ".prettierignore"), "")
      file = File.join(site, "app.js")
      config = File.join(site, ".prettierrc.json")
      [["const x='first';", false], ["const x='first';", false], ["const x='second';", true]].each do |input, single_quote|
        File.write(file, input)
        File.write(config, {singleQuote: single_quote}.to_json)
        expected, error, status = Open3.capture3(cli, "--stdin-filepath", file, stdin_data: input, chdir: directory)
        assert status.success?, error
        output, status = Open3.capture2e("node", formatter, site, cache, chdir: directory)
        assert status.success?, output
        assert_equal expected, File.read(file)
      end
    end
  end

  def test_formats_later_files_after_a_syntax_error
    root = File.expand_path("../..", __dir__)
    Dir.mktmpdir do |directory|
      File.write(File.join(directory, ".prettierignore"), "")
      File.write(File.join(directory, "a-invalid.js"), "const = ;")
      valid = File.join(directory, "z-valid.js")
      File.write(valid, "const x='ok';")
      output, status = Open3.capture2e("node", File.join(root, "_scripts/format.mjs"), directory, chdir: directory)
      refute status.success?
      assert_includes output, "a-invalid.js"
      assert_equal "const x = \"ok\";\n", File.read(valid)
    end
  end

  def test_rejects_corrupt_cached_output
    root = File.expand_path("../..", __dir__)
    Dir.mktmpdir do |directory|
      site = File.join(directory, "site")
      cache = File.join(directory, "cache")
      FileUtils.mkdir_p(site)
      File.write(File.join(directory, ".prettierignore"), "")
      file = File.join(site, "app.js")
      input = "const x='ok';"
      File.write(file, input)
      args = ["node", File.join(root, "_scripts/format.mjs"), site, cache]
      output, status = Open3.capture2e(*args, chdir: directory)
      assert status.success?, output
      cached = Dir[File.join(cache, "*")].fetch(0)
      File.write(cached, {digest: "wrong", formatted: "truncated"}.to_json)
      File.write(file, input)
      output, status = Open3.capture2e(*args, chdir: directory)
      refute status.success?
      assert_includes output, "Corrupt formatter cache entry"
      assert_equal input, File.read(file)
    end
  end

  private

  def run_hook(prettier_exit_status:)
    previous_cache_dir = Jekyll::Cache.cache_dir
    Dir.mktmpdir do |directory|
      Jekyll::Cache.cache_dir = File.join(directory, "cache")
      formatter_path = File.join(directory, "_scripts", "format.mjs")
      FileUtils.mkdir_p(File.dirname(formatter_path))
      File.write(formatter_path, "process.exit(#{prettier_exit_status});\n")

      capture_io do
        prettier_hook.call OpenStruct.new(source: directory, dest: directory)
      end.first
    end
  ensure
    Jekyll::Cache.cache_dir = previous_cache_dir
  end

  def prettier_hook
    registry = Jekyll::Hooks.instance_variable_get(:@registry)
    registry.dig(:site, :post_write).find do |hook|
      hook.source_location.first.end_with?("/_plugins/prettier_format.rb")
    end
  end
end
