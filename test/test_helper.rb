require "bundler"
require "fileutils"
require "net/http"
require "rbconfig"
require "securerandom"
require "tmpdir"
require "uri"

module TestHelper
  ROOT_DIR = File.expand_path("..", __dir__)
  SITE_DIR = File.expand_path("../_site", __dir__)
  SERVER_SCRIPT = File.join(ROOT_DIR, "test", "integration", "server.rb")
  CONFIGURED_BASE_URL = ENV["BASE_URL"]
  DEFAULT_LOCAL_HOST = "127.0.0.1"

  def self.ensure_site_built!
    return if @site_built

    FileUtils.rm_rf(SITE_DIR)

    Dir.chdir(ROOT_DIR) do
      Bundler.with_unbundled_env do
        system("bundle", "exec", "jekyll", "build", "--quiet", exception: true)
      end
    end

    @site_built = true
  end

  def self.base_url
    return CONFIGURED_BASE_URL if CONFIGURED_BASE_URL

    start_site_server!
    @local_base_url
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
