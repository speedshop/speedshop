# Removes development-only pages from normal builds.
# Enable them by setting `vertical_debug: true` in a dev-only config file.

require "fileutils"

module SpeedshopDevOnlyPages
  OUTPUT_PATHS = ["vertical_debug.html"].freeze

  def self.enabled?(site)
    site.config["vertical_debug"]
  end

  def self.remove_from_pages(site)
    site.pages.delete_if { |page| page.data["dev_only"] || OUTPUT_PATHS.include?(page.destination("")) } unless enabled?(site)
  end

  def self.remove_from_output(site)
    unless enabled?(site)
      OUTPUT_PATHS.each do |path|
        FileUtils.rm_f(File.join(site.dest, path))
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  SpeedshopDevOnlyPages.remove_from_pages(site)
end

Jekyll::Hooks.register :site, :pre_render do |site|
  SpeedshopDevOnlyPages.remove_from_pages(site)
end

Jekyll::Hooks.register :site, :post_write do |site|
  SpeedshopDevOnlyPages.remove_from_output(site)
end
