require "minitest/autorun"
require "jekyll"
require "ostruct"
require "tmpdir"

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
      npx_path = File.join(directory, "npx")
      File.write(npx_path, "#!/bin/sh\nexit #{prettier_exit_status}\n")
      File.chmod(0o755, npx_path)

      original_path = ENV.fetch("PATH")
      ENV["PATH"] = "#{directory}:#{original_path}"
      capture_io do
        Jekyll::Hooks.trigger :site, :post_write, OpenStruct.new(dest: directory)
      end.first
    ensure
      ENV["PATH"] = original_path
    end
  end
end
