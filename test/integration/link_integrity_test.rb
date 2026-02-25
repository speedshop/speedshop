require "cgi/escape"
require "concurrent-ruby"
require "minitest/autorun"
require "net/http"
require "nokogiri"
require "pathname"
require "uri"
require_relative "../test_helper"

class LinkIntegrityTest < Minitest::Test
  REQUEST_TIMEOUT_SECONDS = 10
  REDIRECT_LIMIT = 5
  MAX_RETRIES = 3
  POOL_SIZE = 25

  SELECTORS = [
    ["a[href]", "href"],
    ["link[href]", "href"],
    ["script[src]", "src"],
    ["img[src]", "src"],
    ["img[srcset]", "srcset"],
    ["source[src]", "src"],
    ["source[srcset]", "srcset"],
    ["video[src]", "src"],
    ["video[poster]", "poster"],
    ["audio[src]", "src"],
    ["iframe[src]", "src"],
    ["embed[src]", "src"],
    ["object[data]", "data"]
  ].freeze

  def setup
    TestHelper.ensure_site_built!
    TestHelper.start_site_server!

    @base_url = TestHelper.base_url
    @internal_hosts = Set.new([
      URI.parse(@base_url).host,
      "localhost",
      "127.0.0.1",
      "www.speedshop.co",
      "speedshop.co"
    ].compact)
  end

  def test_all_built_links_assets_and_fragments_are_valid
    references = collect_references

    failures = []
    failures.concat(validate_non_http_schemes(references))

    url_targets, fragment_targets, resolution_failures = build_targets(references)
    failures.concat(resolution_failures)

    response_cache = Concurrent::Map.new

    target_failures = check_targets(url_targets, response_cache)
    external_timeout_failures, hard_target_failures = target_failures.partition { |failure| failure[:kind] == :external_timeout }

    warn format_external_timeout_warnings(external_timeout_failures) unless external_timeout_failures.empty?

    failures.concat(hard_target_failures)
    failures.concat(check_fragments(fragment_targets, response_cache))

    assert failures.empty?, format_failures(failures)
  end

  private

  def collect_references
    refs = []

    Dir.glob(File.join(TestHelper::SITE_DIR, "**", "*.html")).sort.each do |path|
      html = File.read(path)
      doc = Nokogiri::HTML(html)
      source_url = served_path_for(path)

      SELECTORS.each do |selector, attribute|
        doc.css(selector).each do |node|
          next if selector == "link[href]" && skip_link_check?(node)

          raw_value = node[attribute]
          next if raw_value.nil? || raw_value.strip.empty?

          values = (attribute == "srcset") ? parse_srcset(raw_value) : [raw_value]
          values.each do |value|
            refs << {
              source_file: relative_site_path(path),
              source_url: source_url,
              raw: value.strip,
              selector: selector
            }
          end
        end
      end
    end

    refs
  end

  def parse_srcset(value)
    value.split(",").map do |entry|
      entry.strip.split(/\s+/).first
    end.compact.reject(&:empty?)
  end

  def validate_non_http_schemes(references)
    failures = []

    references.each do |reference|
      raw = reference[:raw]

      if raw.start_with?("mailto:")
        failures << failure(:invalid_mailto, reference, "Invalid mailto syntax") unless valid_mailto?(raw)
      elsif raw.start_with?("tel:")
        failures << failure(:invalid_tel, reference, "Invalid tel syntax") unless valid_tel?(raw)
      end
    end

    failures
  end

  def build_targets(references)
    url_targets = Hash.new { |h, k| h[k] = Set.new }
    fragment_targets = Hash.new { |h, k| h[k] = Set.new }
    failures = []

    references.each do |reference|
      raw = reference[:raw]
      next if ignorable_scheme?(raw)
      next if raw.start_with?("mailto:", "tel:")
      next if raw == "#"

      resolved = resolve_url(reference[:source_url], raw)
      unless resolved
        failures << failure(:invalid_url, reference, "Could not resolve URL")
        next
      end

      normalized = normalize_internal_url(resolved)
      normalized_key = normalized.dup
      fragment = normalized_key.fragment
      normalized_key.fragment = nil

      target_key = normalized_key.to_s
      url_targets[target_key] << reference_location(reference)

      next unless fragment && !fragment.empty?
      next unless @internal_hosts.include?(normalized_key.host)

      fragment_targets[[target_key, CGI.unescape(fragment)]] << reference_location(reference)
    end

    [url_targets, fragment_targets, failures]
  end

  def check_targets(targets, response_cache)
    run_parallel_checks(targets) do |url, locations|
      check_target(url, locations.to_a, response_cache)
    end
  end

  def check_target(url, locations, response_cache)
    uri = URI.parse(url)

    last_error = nil
    last_response = nil
    all_attempts_timed_out = true

    MAX_RETRIES.times do
      result = request_with_redirects(uri)
      response = result[:response]
      code = response.code.to_i

      all_attempts_timed_out = false

      if successful_status?(uri, code)
        response_cache[url] = result
        return nil
      end

      last_response = response
      last_error = "HTTP #{code}"
    rescue => e
      last_error = "#{e.class}: #{e.message}"
      all_attempts_timed_out &&= timeout_exception?(e)
    end

    details = if last_response
      "HTTP #{last_response.code} after #{MAX_RETRIES} attempts"
    else
      "#{last_error} after #{MAX_RETRIES} attempts"
    end

    if all_attempts_timed_out && external_host?(uri.host)
      return {
        kind: :external_timeout,
        url: url,
        locations: locations,
        details: details
      }
    end

    {
      kind: :dead_link,
      url: url,
      locations: locations,
      details: details
    }
  end

  def check_fragments(fragment_targets, response_cache)
    run_parallel_checks(fragment_targets) do |(url, fragment), locations|
      check_fragment(url, fragment, locations.to_a, response_cache)
    end
  end

  def check_fragment(url, fragment, locations, response_cache)
    result = response_cache[url]

    unless result
      uri = URI.parse(url)
      fetched = request_with_redirects(uri)
      result = response_cache.put_if_absent(url, fetched) || fetched
    end

    response = result[:response]
    content_type = response["content-type"].to_s

    unless content_type.include?("text/html") || content_type.include?("application/xhtml+xml")
      return {
        kind: :invalid_fragment,
        url: "#{url}##{fragment}",
        locations: locations,
        details: "Fragment target is not HTML (#{content_type.empty? ? "unknown content-type" : content_type})"
      }
    end

    doc = Nokogiri::HTML(response.body)
    exists = doc.css("[id], [name]").any? do |node|
      node["id"] == fragment || node["name"] == fragment
    end

    return nil if exists

    {
      kind: :missing_fragment,
      url: "#{url}##{fragment}",
      locations: locations,
      details: "No matching id/name in target document"
    }
  rescue => e
    {
      kind: :invalid_fragment,
      url: "#{url}##{fragment}",
      locations: locations,
      details: "#{e.class}: #{e.message}"
    }
  end

  def run_parallel_checks(targets)
    executor = Concurrent::ThreadPoolExecutor.new(
      min_threads: POOL_SIZE,
      max_threads: POOL_SIZE,
      max_queue: 10_000,
      fallback_policy: :caller_runs
    )

    futures = targets.map do |target, locations|
      Concurrent::Promises.future_on(executor) do
        yield(target, locations)
      end
    end

    futures.map(&:value!).compact
  ensure
    executor&.shutdown
    executor&.wait_for_termination(30)
  end

  def successful_status?(uri, code)
    return true if code.between?(200, 299)
    return true if code == 403 && blocked_but_existing_host?(uri.host)

    false
  end

  def blocked_but_existing_host?(host)
    [
      "www.reddit.com",
      "reddit.com",
      "twitter.com",
      "www.twitter.com",
      "x.com",
      "www.x.com",
      "www.sec.gov",
      "www.akamai.com",
      "www.webpagetest.org",
      "webpagetest.org",
      "martinsilvertant.deviantart.com",
      "medium.com",
      "docs.shopify.com",
      "blog.twitter.com",
      "www.rubyvideo.dev"
    ].include?(host)
  end

  def request_with_redirects(uri)
    current = uri

    REDIRECT_LIMIT.times do
      response = perform_request(current)
      code = response.code.to_i

      if code.between?(300, 399)
        location = response["location"]
        raise "Redirect without Location header" if location.nil? || location.empty?

        current = URI.join(current.to_s, location)
        current = normalize_internal_url(current)
        next
      end

      return {response: response, final_uri: current}
    end

    raise "Too many redirects"
  end

  def perform_request(uri)
    Net::HTTP.start(
      uri.host,
      uri.port,
      use_ssl: uri.scheme == "https",
      open_timeout: REQUEST_TIMEOUT_SECONDS,
      read_timeout: REQUEST_TIMEOUT_SECONDS
    ) do |http|
      request = Net::HTTP::Get.new(uri.request_uri.empty? ? "/" : uri.request_uri)
      request["User-Agent"] = "speedshop-link-checker/1.0"
      http.request(request)
    end
  end

  def resolve_url(source_url, raw)
    base = "#{@base_url}#{source_url}"
    candidate = raw.start_with?("//") ? "#{URI.parse(@base_url).scheme}:#{raw}" : raw

    URI.join(base, candidate)
  rescue URI::InvalidURIError
    nil
  end

  def normalize_internal_url(uri)
    return uri unless @internal_hosts.include?(uri.host)

    base = URI.parse(@base_url)

    normalized = uri.dup
    normalized.scheme = base.scheme
    normalized.host = base.host
    normalized.port = base.port
    normalized
  end

  def ignorable_scheme?(raw)
    raw.start_with?("javascript:", "data:", "about:", "blob:")
  end

  def skip_link_check?(node)
    rel = node["rel"].to_s.downcase
    rel.split.include?("preconnect") || rel.split.include?("dns-prefetch")
  end

  def valid_mailto?(value)
    address_part = value.delete_prefix("mailto:").split("?").first.to_s
    addresses = address_part.split(",").map(&:strip).reject(&:empty?)
    return false if addresses.empty?

    addresses.all? { |address| URI::MailTo::EMAIL_REGEXP.match?(address) }
  rescue
    false
  end

  def valid_tel?(value)
    number = value.delete_prefix("tel:").strip
    number.match?(/\A\+?[0-9()\-.\s]+\z/) && number.match?(/[0-9]/)
  end

  def external_host?(host)
    !@internal_hosts.include?(host)
  end

  def timeout_exception?(error)
    error.is_a?(Net::OpenTimeout) ||
      error.is_a?(Net::ReadTimeout) ||
      error.is_a?(Timeout::Error) ||
      error.is_a?(Errno::ETIMEDOUT)
  end

  def format_external_timeout_warnings(failures)
    details = failures.first(20).map do |failure|
      "- #{failure[:url]} (#{failure[:details]})"
    end.join("\n")

    <<~MSG
      Skipping #{failures.count} external links due to network timeouts:
      #{details}
    MSG
  end

  def served_path_for(file_path)
    relative = relative_site_path(file_path)

    return "/" if relative == "index.html"
    return "/#{relative.delete_suffix("index.html")}" if relative.end_with?("/index.html")

    "/#{relative}"
  end

  def relative_site_path(path)
    Pathname.new(path).relative_path_from(Pathname.new(TestHelper::SITE_DIR)).to_s
  end

  def reference_location(reference)
    "#{reference[:source_file]} (#{reference[:selector]} => #{reference[:raw]})"
  end

  def failure(kind, reference, details)
    {
      kind: kind,
      url: reference[:raw],
      locations: [reference_location(reference)],
      details: details
    }
  end

  def format_failures(failures)
    grouped = failures.group_by { |failure| failure[:kind] }

    summary = grouped.map { |kind, entries| "#{kind}: #{entries.count}" }.join(", ")

    details = failures.first(40).map do |failure|
      <<~TEXT
        - [#{failure[:kind]}] #{failure[:url]}
          #{failure[:details]}
          from: #{failure[:locations].first}
      TEXT
    end.join("\n")

    <<~MSG
      Link integrity check failed (#{failures.count} total failures; #{summary})

      #{details}
    MSG
  end
end
