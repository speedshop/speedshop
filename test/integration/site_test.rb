require "minitest/autorun"
require "net/http"
require "uri"
require "json"
require_relative "../test_helper"

TestHelper.ensure_site_built! unless ENV["BASE_URL"]

class SiteTest < Minitest::Test
  BASE_URL = TestHelper.base_url

  def get(path, headers = {})
    uri = URI.parse("#{BASE_URL}#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = 10
    http.read_timeout = 10

    request = Net::HTTP::Get.new(uri.request_uri)
    headers.each { |k, v| request[k] = v }

    http.request(request)
  end

  def test_blog_post_markdown_available_at_index
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/markdown"
  end

  def test_blog_post_markdown_available_at_slug
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching.md", {"Accept" => "text/html"})
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/markdown"
  end

  def test_markdown_has_no_pandoc_artifacts
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    body = response.body

    refute_match(/^:::/, body,
      "Markdown should not have Pandoc div markers (:::)")
    refute_match(/\{\.[\w-]+\}/, body,
      "Markdown should not have Pandoc attribute syntax ({.class})")
  end

  def test_markdown_renders_liquid_tags
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    body = response.body

    refute_match(/\{%\s*(marginnote_lazy|sidenote)/, body,
      "Markdown should contain rendered content, not Liquid source")
  end

  def test_accept_markdown_returns_markdown
    skip "Content negotiation requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching/", {
      "Accept" => "text/markdown"
    })

    assert_equal "200", response.code
    assert_includes response["content-type"], "text/markdown"
  end

  def test_accept_html_returns_html
    response = get("/blog/the-complete-guide-to-rails-caching/", {
      "Accept" => "text/html"
    })

    assert_equal "200", response.code
    assert_includes response["content-type"], "text/html"
  end

  def test_vary_header_includes_accept
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/", {"Accept" => "text/markdown"})

    assert response["vary"], "Vary header should be present"
    assert_includes response["vary"].downcase, "accept"
  end

  def test_markdown_has_content_signal_header
    skip "Markdown requires Cloudflare" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching.md")

    assert_includes response["content-signal"], "ai-train=yes"
  end

  def test_card_returns_text_by_default
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/plain"
  end

  def test_card_json_format
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card?format=json")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/json"

    data = JSON.parse(response.body)
    assert data["name"] || data["email"], "Card JSON should have contact info"
  end

  def test_card_vcard_format
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card?format=vcard")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/vcard"
    assert_includes response.body, "BEGIN:VCARD"
  end

  def test_card_html_format
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card?format=html")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/html"
  end

  def test_card_accepts_header_json
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card", {"Accept" => "application/json"})
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/json"
  end

  def test_yuki_card_json_format
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card/yuki?format=json")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/json"

    data = JSON.parse(response.body)
    assert_equal "Yuki Nishijima", data["name"]
    assert_equal "yuki.nishijima@speedshop.co", data["email"]
  end

  def test_yuki_card_vcard_extension
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card/yuki.vcf")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/vcard"
    assert_includes response.body, "Yuki Nishijima"
    assert_includes response.body, "yuki.nishijima@speedshop.co"
  end

  def test_yuki_card_accepts_header_html
    skip "Card endpoint requires production Cloudflare worker" unless production?

    response = get("/card/yuki", {"Accept" => "text/html"})
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/html"
    assert_includes response.body, "Yuki Nishijima"
  end

  # Basic site tests

  def test_homepage_loads
    response = get("/")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/html"
  end

  def test_blog_index_loads
    response = get("/blog/")
    assert_equal "200", response.code
  end

  def test_four_line_friday_archive_loads
    response = get("/four-line-fridays.html")

    assert_equal "200", response.code
    assert_includes response.body, 'id="four-line-search"'
  end

  def test_robots_txt_exists
    response = get("/robots.txt")
    assert_equal "200", response.code
  end

  def test_404_for_missing_page
    response = get("/this-page-does-not-exist-12345")
    assert_equal "404", response.code
  end

  # PDF/EPUB availability

  def test_blog_post_pdf_available
    response = get("/blog/the-complete-guide-to-rails-caching/index.pdf")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/pdf"
  end

  def test_blog_post_epub_available
    response = get("/blog/the-complete-guide-to-rails-caching/index.epub")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/epub"
  end

  def test_blog_post_pdf_available_at_slug
    response = get("/blog/the-complete-guide-to-rails-caching.pdf")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/pdf"
  end

  def test_blog_post_epub_available_at_slug
    response = get("/blog/the-complete-guide-to-rails-caching.epub")
    assert_equal "200", response.code
    assert_includes response["content-type"], "application/epub"
  end

  # Legacy redirect tests

  def test_legacy_blog_url_redirects
    skip "Redirect tests require Cloudflare redirect rules" unless production?

    uri = URI.parse("#{BASE_URL}/2015/07/15/the-complete-guide-to-rails-caching.html")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"

    request = Net::HTTP::Get.new(uri.request_uri)
    response = http.request(request)

    assert_equal "301", response.code
    assert_includes response["location"], "/blog/the-complete-guide-to-rails-caching"
  end

  private

  def localhost?
    BASE_URL.include?("localhost") || BASE_URL.include?("127.0.0.1")
  end

  # Returns true only for production (speedshop.co)
  # Card worker and redirect rules only work in production
  def production?
    BASE_URL.include?("speedshop.co")
  end
end
