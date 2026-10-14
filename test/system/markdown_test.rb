require "minitest/autorun"
require "net/http"
require "uri"

class MarkdownTest < Minitest::Test
  BASE_URL = ENV.fetch("BASE_URL", "https://www.speedshop.co")
  BLOG = "/blog/the-complete-guide-to-rails-caching"
  ALIASES = {
    "/" => %w[/index.md /.md /index.html.md],
    "/retainer.html" => %w[/retainer.md /retainer.html.md /retainer/index.md /retainer/index.html.md /retainer/.md],
    "#{BLOG}/" => ["#{BLOG}.md", "#{BLOG}/index.md", "#{BLOG}/.md", "#{BLOG}/index.html.md", "/2015/07/15/the-complete-guide-to-rails-caching.md", "/2015/07/15/the-complete-guide-to-rails-caching.html.md"],
    "/archives/tune.html" => %w[/tune.md /tune.html.md /tune/index.md /tune/index.html.md /tune/.md],
    "/archives/rails-performance-workshop.html" => %w[/rails-performance-workshop.md /rails-performance-workshop.html.md /rails-performance-workshop/index.md /rails-performance-workshop/index.html.md /rails-performance-workshop/.md],
    "/archives/vertical_debug.html" => %w[/vertical_debug.md /vertical_debug.html.md /vertical_debug/index.md /vertical_debug/index.html.md /vertical_debug/.md]
  }.freeze

  def request(path, headers = {}, head: false)
    uri = URI.join(BASE_URL, path)
    message = head ? Net::HTTP::Head.new(uri) : Net::HTTP::Get.new(uri)
    headers.each { |key, value| message[key] = value }
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: 30) do |http|
      http.request(message)
    end
  end

  def test_explicit_aliases_match_negotiated_markdown
    ALIASES.each do |canonical, aliases|
      expected = request(canonical, {"Accept" => "text/markdown"})
      assert_equal "200", expected.code
      assert_includes expected["content-type"], "text/markdown"

      aliases.each do |path|
        ["*/*", "text/html"].each do |accept|
          actual = request(path, {"Accept" => accept})
          assert_equal "200", actual.code, path
          assert_nil actual["location"], path
          assert_includes actual["content-type"], "text/markdown", path
          assert_equal expected.body, actual.body, path
        end
      end
    end
  end

  def test_representations_do_not_leak_between_requests
    ALIASES.each do |canonical, aliases|
      html = request(canonical, {"Accept" => "text/html"})
      assert_equal "200", html.code
      assert_includes html["content-type"], "text/html"

      3.times do
        markdown = request(canonical, {"Accept" => "text/markdown"})
        assert_includes markdown["content-type"], "text/markdown"
        assert_includes markdown["vary"].downcase, "accept"
        assert_includes markdown["content-signal"], "ai-train=yes"

        explicit = request(aliases.first + "?utm_source=markdown-system-test", {"Accept" => "text/html"})
        assert_equal "200", explicit.code
        assert_includes explicit["content-type"], "text/markdown"

        ordinary = request(canonical)
        assert_includes ordinary["content-type"], "text/html"
        assert_equal html.body, ordinary.body
      end
    end
  end

  def test_missing_alias_and_retired_full_index
    assert_equal "404", request("/missing-markdown-system-test.md").code
    assert_equal "404", request("/llms-full.txt").code
    index = request("/llms.txt")
    assert_equal "200", index.code
    assert_includes index.body, "Accept: text/markdown"
    assert_includes index.body, "#{BLOG}/"
    assert_includes request("/")["link"], "llms.txt"
  end

  def test_native_asset_range_and_conditional_range
    path = "/assets/threadpilot-visual/dist/music.m4a"
    metadata = request(path, {}, head: true)
    assert_equal "200", metadata.code
    assert metadata["etag"]

    partial = request(path, {"Range" => "bytes=0-31", "If-Range" => metadata["etag"]})
    assert_equal "206", partial.code
    assert_equal "bytes 0-31/#{metadata["content-length"]}", partial["content-range"]
    assert_equal 32, partial.body.bytesize
  end
end
