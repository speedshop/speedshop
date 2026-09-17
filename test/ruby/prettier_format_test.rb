require "minitest/autorun"
require "jekyll"
require "ostruct"
require "tmpdir"
require "fileutils"

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

  private

  def run_hook(prettier_exit_status:)
    Dir.mktmpdir do |directory|
      prettier_path = File.join(directory, "node_modules", ".bin", "prettier")
      FileUtils.mkdir_p(File.dirname(prettier_path))
      File.write(prettier_path, "#!/bin/sh\nexit #{prettier_exit_status}\n")
      File.chmod(0o755, prettier_path)

      capture_io do
        prettier_hook.call OpenStruct.new(source: directory, dest: directory)
      end.first
    end
  end

  def prettier_hook
    registry = Jekyll::Hooks.instance_variable_get(:@registry)
    registry.dig(:site, :post_write).find do |hook|
      hook.source_location.first.end_with?("/_plugins/prettier_format.rb")
    end
  end
end
