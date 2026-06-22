require "bundler"
require "digest"
require "fileutils"
require "net/http"
require "rbconfig"
require "securerandom"
require "tmpdir"
require "uri"

module TestHelper
  ROOT_DIR = File.expand_path("..", __dir__)
  SITE_DIR = File.join(Dir.tmpdir, "speedshop-test-site-#{Process.pid}")
  SERVER_SCRIPT = File.join(ROOT_DIR, "test", "integration", "server.rb")
  CONFIGURED_BASE_URL = ENV["BASE_URL"]
  DEFAULT_LOCAL_HOST = "127.0.0.1"

  # Lives inside _site so Jekyll's cleaner deletes it on any build this
  # helper didn't perform (such as the dev stack's `jekyll build -w`, whose
  # drafts and dev config must not leak into tests), forcing a rebuild.
  BUILD_FINGERPRINT_FILE = File.join(SITE_DIR, ".build-fingerprint")

  def self.ensure_site_built!
    return if @site_built

    build_site! unless site_fresh?

    wait_for_expected_site_files!
    @site_built = true
  end

  # Reuse a previous build (e.g. from an earlier rake task in the same
  # `mise run test` chain) when the sources that produced it are unchanged.
  def self.site_fresh?
    File.exist?(BUILD_FINGERPRINT_FILE) &&
      File.read(BUILD_FINGERPRINT_FILE) == source_fingerprint
  end

  def self.build_site!
    # Fingerprint the sources before building so an edit made while Jekyll
    # runs invalidates the result.
    fingerprint = source_fingerprint

    FileUtils.rm_rf(SITE_DIR)

    Dir.chdir(ROOT_DIR) do
      Bundler.with_unbundled_env do
        system(
          RbConfig.ruby, "-S", "bundle", "exec", "jekyll", "build", "--quiet",
          "--destination", SITE_DIR,
          exception: true
        )
      end
    end

    wait_for_expected_site_files!
    File.write(BUILD_FINGERPRINT_FILE, fingerprint) if fingerprint
  end

  # Digest of HEAD plus the path and content of every dirty or untracked
  # file. nil when git is unavailable, so the fingerprint is never written
  # and every run rebuilds, matching the old behavior.
  def self.source_fingerprint
    head = git_capture("rev-parse", "HEAD")
    status = git_capture("status", "--porcelain=v1", "-z", "--untracked-files=all")
    return unless head && status

    digest = Digest::SHA256.new
    digest << head << status

    status.split("\0").each do |entry|
      path = File.join(ROOT_DIR, entry[3..].to_s)
      digest << Digest::SHA256.file(path).digest if File.file?(path)
    end

    digest.hexdigest
  end

  def self.git_capture(*args)
    output = IO.popen(["git", "-C", ROOT_DIR, *args]) { |io| io.read }

    output if $?.success?
  end

  def self.base_url
    return CONFIGURED_BASE_URL if CONFIGURED_BASE_URL

    start_site_server!
    @local_base_url
  end

  def self.wait_for_expected_site_files!
    expected = [
      File.join(SITE_DIR, "sitemap.xml"),
      File.join(SITE_DIR, "llms.txt"),
      File.join(SITE_DIR, "llms-full.txt")
    ]

    100.times do
      return if expected.all? { |path| File.exist?(path) }
      sleep 0.1
    end

    missing = expected.reject { |path| File.exist?(path) }
    raise "Timed out waiting for generated site files: #{missing.join(", ")}"
  end

  def self.start_site_server!
    return if CONFIGURED_BASE_URL
    return if @server_pid

    @port_file = File.join(Dir.tmpdir, "speedshop-test-server-#{Process.pid}-#{SecureRandom.hex(6)}.port")

    env = {
      "TEST_SERVER_HOST" => DEFAULT_LOCAL_HOST,
      "TEST_SERVER_PORT" => "0",
      "TEST_SERVER_PORT_FILE" => @port_file,
      "TEST_SITE_DIR" => SITE_DIR
    }

    @server_pid = Process.spawn(env, RbConfig.ruby, SERVER_SCRIPT, chdir: ROOT_DIR, out: File::NULL, err: File::NULL)

    assigned_port = wait_for_assigned_port!
    @local_base_url = "http://#{DEFAULT_LOCAL_HOST}:#{assigned_port}"

    wait_for_server!(URI.parse(@local_base_url))
    at_exit { stop_site_server! }
  end

  def self.stop_site_server!
    return unless @server_pid

    Process.kill("TERM", @server_pid)
    Process.wait(@server_pid)
  rescue Errno::ESRCH, Errno::ECHILD
    nil
  ensure
    @server_pid = nil
    @local_base_url = nil
    FileUtils.rm_f(@port_file) if @port_file
    @port_file = nil
  end

  def self.wait_for_assigned_port!
    60.times do
      if File.exist?(@port_file)
        raw = File.read(@port_file).strip
        return Integer(raw) if raw.match?(/\A\d+\z/) && raw.to_i.positive?
      end

      if @server_pid && Process.waitpid(@server_pid, Process::WNOHANG)
        raise "Test server exited before reporting assigned port"
      end

      sleep 0.1
    end

    stop_site_server!
    raise "Timed out waiting for assigned test server port"
  end

  def self.wait_for_server!(uri)
    60.times do
      response = Net::HTTP.start(uri.host, uri.port, open_timeout: 1, read_timeout: 1) do |http|
        http.request(Net::HTTP::Get.new("/"))
      end
      return if response
    rescue
      sleep 0.1
    end

    stop_site_server!
    raise "Test server did not start at #{uri}"
  end
end
