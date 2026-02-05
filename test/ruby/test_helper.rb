require "fileutils"
require "bundler"

module TestHelper
  SITE_DIR = File.expand_path("../../_site", __dir__)
  ROOT_DIR = File.expand_path("../..", __dir__)

  def self.ensure_site_built!
    return if @site_built

    puts "Building site for tests..."
    FileUtils.rm_rf(SITE_DIR)

    Dir.chdir(ROOT_DIR) do
      Bundler.with_unbundled_env do
        system("bundle", "exec", "jekyll", "build", "--quiet", exception: true)
      end
    end

    @site_built = true
    puts "Site built."
  end
end

TestHelper.ensure_site_built!
