require "pathname"
require "webrick"

host = ENV.fetch("TEST_SERVER_HOST", "127.0.0.1")
port = ENV.fetch("TEST_SERVER_PORT", "0").to_i
port_file = ENV["TEST_SERVER_PORT_FILE"]
site_dir = ENV.fetch("TEST_SITE_DIR")

class SiteServlet < WEBrick::HTTPServlet::AbstractServlet
  def initialize(server, site_dir)
    super(server)
    @site_dir = site_dir
  end

  def do_GET(req, res)
    serve(req, res, include_body: true)
  end

  def do_HEAD(req, res)
    serve(req, res, include_body: false)
  end

  private

  def serve(req, res, include_body:)
    resolved = resolve_path(req.path)

    unless resolved
      res.status = 404
      res["Content-Type"] = "text/plain"
      res.body = "Not Found" if include_body
      return
    end

    if resolved[:redirect]
      res.status = 301
      res["Location"] = resolved[:redirect]
      return
    end

    file_path = resolved[:file]

    unless File.file?(file_path)
      res.status = 404
      res["Content-Type"] = "text/plain"
      res.body = "Not Found" if include_body
      return
    end

    res.status = 200
    res["Content-Type"] = WEBrick::HTTPUtils.mime_type(File.extname(file_path), WEBrick::HTTPUtils::DefaultMimeTypes)
    res["Cache-Control"] = "max-age=86400"
    res["Vary"] = "Accept-Encoding"
    res.body = File.binread(file_path) if include_body
  end

  def resolve_path(path)
    normalized = path.to_s.split("?").first
    normalized = "/" if normalized.empty?

    candidate = File.expand_path(".#{normalized}", @site_dir)
    return nil unless within_site?(candidate)

    if normalized.end_with?("/")
      index_file = File.join(candidate, "index.html")
      return {file: index_file} if File.file?(index_file)
    end

    return {file: candidate} if File.file?(candidate)

    html_file = "#{candidate}.html"
    return {file: html_file} if File.file?(html_file)

    index_file = File.join(candidate, "index.html")
    return {redirect: "#{normalized}/"} if File.file?(index_file)

    nil
  end

  def within_site?(candidate)
    root = Pathname.new(@site_dir).realpath
    path = Pathname.new(candidate).cleanpath

    root_str = root.to_s
    path_str = path.to_s

    path_str == root_str || path_str.start_with?("#{root_str}/")
  rescue Errno::ENOENT
    false
  end
end

server = WEBrick::HTTPServer.new(
  Port: port,
  BindAddress: host,
  AccessLog: [],
  Logger: WEBrick::Log.new(File::NULL)
)

if port_file
  assigned_port = server.listeners.first.addr[1]
  File.write(port_file, assigned_port.to_s)
end

server.mount("/", SiteServlet, site_dir)

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

server.start
