require "fileutils"
require "rbconfig"

root = File.expand_path("..", __dir__)
Dir.chdir(root) do
  site_dir = "tmp/threadpilot-preview-site"
  preview_dir = "tmp/threadpilot-preview"
  environment = {"GENERATED_DATA_FIXTURES_PATH" => "test/fixtures/generated_data", "JEKYLL_ENV" => "preview"}

  unless system(environment, RbConfig.ruby, "-S", "jekyll", "build", "--config", "_config.yml,_config_preview.yml", "--destination", site_dir)
    abort "Threadpilot preview build failed"
  end

  html = File.read(File.join(site_dir, "threadpilot.html"))
  abort "Threadpilot preview CSS was not inlined" if html.include?("<!-- INLINE_CSS -->")
  abort "Threadpilot preview asset manifest is missing" unless File.file?(File.join(site_dir, "assets/manifest.json"))

  FileUtils.rm_rf(preview_dir)
  FileUtils.mkdir_p(preview_dir)
  FileUtils.cp_r(File.join(site_dir, "assets"), preview_dir)
  %w[index.html threadpilot.html].each { |name| File.write(File.join(preview_dir, name), html) }
  File.write(File.join(preview_dir, "_headers"), "/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n")

  files = Dir.glob("#{preview_dir}/**/*").select { |path| File.file?(path) }
  abort "Threadpilot preview exceeds the 20,000 asset limit" if files.length > 20_000
  oversized = files.select { |path| File.size(path) > 25 * 1024 * 1024 }
  abort "Threadpilot preview assets exceed 25 MiB: #{oversized.join(", ")}" unless oversized.empty?

  puts "Threadpilot preview ready: #{File.join(root, preview_dir)}"
end
