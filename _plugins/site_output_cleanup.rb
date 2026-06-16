require "fileutils"

Jekyll::Hooks.register :site, :post_write do |site|
  %w[infra workers].each do |entry|
    FileUtils.rm_rf(File.join(site.dest, entry))
  end

  FileUtils.rm_f(File.join(site.dest, "vertical_debug.html")) unless site.config["vertical_debug"]
end
