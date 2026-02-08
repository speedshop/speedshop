require "minitest/autorun"
require "net/http"
require "uri"
require "json"

class SiteTest < Minitest::Test
  BASE_URL = ENV.fetch("BASE_URL", "http://localhost:4000")

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

  # llms.txt tests

  def test_llms_txt_exists
    response = get("/llms.txt")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/plain"
  end

  def test_llms_txt_has_expected_structure
    response = get("/llms.txt")
    body = response.body

    assert_includes body, "# Speedshop"
    assert_includes body, "## Blog Posts"
    assert_match(/\[.+\]\(https:\/\/www\.speedshop\.co\/.+\.md\)/, body)
  end

  def test_llms_full_txt_exists
    response = get("/llms-full.txt")
    assert_equal "200", response.code
    assert_includes response["content-type"], "text/plain"
  end

  def test_llms_full_txt_has_content
    response = get("/llms-full.txt")
    body = response.body

    assert_includes body, "# Speedshop - Full Content"
    assert body.length > 10_000, "llms-full.txt should have substantial content"
  end

  # Markdown file tests

  def test_blog_post_markdown_available_at_index
    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    assert_equal "200", response.code
  end

  def test_blog_post_markdown_available_at_slug
    response = get("/blog/the-complete-guide-to-rails-caching.md")
    assert_equal "200", response.code
  end

  def test_markdown_has_llms_header
    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    body = response.body

    assert_match(/<!--.*llms\.txt.*-->/, body,
      "Markdown files should have llms.txt reference header (requires pandoc_converter.rb update)")
  end

  def test_markdown_has_no_pandoc_artifacts
    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    body = response.body

    refute_match(/^:::/, body,
      "Markdown should not have Pandoc div markers (:::)")
    refute_match(/\{\.[\w-]+\}/, body,
      "Markdown should not have Pandoc attribute syntax ({.class})")
  end

  def test_markdown_preserves_liquid_tags
    response = get("/blog/the-complete-guide-to-rails-caching/index.md")
    body = response.body

    assert_match(/\{%\s*(marginnote_lazy|sidenote)/, body,
      "Markdown should preserve Liquid tags like marginnote_lazy and sidenote")
  end

  # Content negotiation tests (requires Cloudflare worker in production)

  def test_accept_markdown_returns_markdown
    skip "Content negotiation requires Cloudflare worker" if localhost?

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

  # Agent header tests (requires Cloudflare worker in production)

  def test_link_header_advertises_llms_txt
    skip "Agent headers require Cloudflare worker" if localhost?

    response = get("/")
    link_header = response["link"]

    assert link_header, "Link header should be present"
    assert_includes link_header, "llms.txt"
    assert_includes link_header, 'rel="llms-txt"'
  end

  def test_x_llms_txt_header_present
    skip "Agent headers require Cloudflare worker" if localhost?

    response = get("/")

    assert_equal "/llms.txt", response["x-llms-txt"]
  end

  def test_vary_header_includes_accept
    skip "Vary header requires Cloudflare worker" if localhost?

    response = get("/")

    assert response["vary"], "Vary header should be present"
    assert_includes response["vary"].downcase, "accept"
  end

  def test_markdown_has_noindex_header
    skip "X-Robots-Tag requires Cloudflare worker" if localhost?

    response = get("/blog/the-complete-guide-to-rails-caching.md")

    assert response["x-robots-tag"], "X-Robots-Tag should be present on markdown"
    assert_includes response["x-robots-tag"].downcase, "noindex"
  end

  # Card endpoint tests (requires card Cloudflare worker - separate from agent worker)

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

  def test_robots_txt_exists
    response = get("/robots.txt")
    assert_equal "200", response.code
  end

  def test_robots_txt_allows_llms_txt
    response = get("/robots.txt")
    assert_includes response.body, "llms.txt",
      "robots.txt should explicitly allow llms.txt (requires robots.txt update)"
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

  # Returns true if testing against static file server (no worker)
  # Returns false if testing against wrangler dev (port 8787) or production
  def localhost?
    return false if BASE_URL.include?(":8787") # wrangler dev
    BASE_URL.include?("localhost") || BASE_URL.include?("127.0.0.1")
  end

  # Returns true only for production (speedshop.co)
  # Card worker and redirect rules only work in production
  def production?
    BASE_URL.include?("speedshop.co")
  end
end
