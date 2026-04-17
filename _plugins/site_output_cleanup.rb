require "fileutils"

Jekyll::Hooks.register :site, :post_write do |site|
  %w[infra workers].each do |entry|
    FileUtils.rm_rf(File.join(site.dest, entry))
  end
end
