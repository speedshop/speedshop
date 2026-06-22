require "fileutils"

Jekyll::Hooks.register :site, :post_write do |site|
  %w[infra workers].each do |entry|
    FileUtils.rm_rf(File.join(site.dest, entry))
  end

  unless site.config["vertical_debug"]
    FileUtils.rm_f(File.join(site.dest, "type_specimen.html"))
    FileUtils.rm_f(File.join(site.dest, "vertical_debug.html"))
  end
end
