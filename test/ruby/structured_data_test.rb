require "json"
require "minitest/autorun"
require "jekyll"
require "time"
require_relative "../../_plugins/structured_data"

class StructuredDataTest < Minitest::Test
  NODE_SCHEMAS = {
    "Person" => %w[@type @id url name image sameAs],
    "Organization" => %w[@type @id name url logo founder],
    "WebSite" => %w[@type @id url name description publisher inLanguage],
    "ImageObject" => %w[@type url],
    "Blog" => %w[@type @id isPartOf mainEntityOfPage name description inLanguage dateModified publisher],
    "WebPage" => %w[@type @id url name description isPartOf publisher primaryImageOfPage inLanguage],
    "CollectionPage" => %w[@type @id url name description isPartOf publisher primaryImageOfPage inLanguage],
    "BlogPosting" => %w[@type @id url mainEntityOfPage isPartOf author publisher headline name description image datePublished dateModified inLanguage],
    "Service" => %w[@type @id url mainEntityOfPage name description provider image offers inLanguage],
    "BreadcrumbList" => %w[@type @id itemListElement],
    "ListItem" => %w[@type position name item],
    "Offer" => %w[@type price priceCurrency availability url]
  }.freeze

  def setup
    @site = self.class.site
  end

  def test_json_ld_is_syntactically_valid_and_matches_schema_for_all_structured_pages
    failures = []

    structured_pages.each do |page|
      data = JSON.parse(structured_data_for(page).to_json_ld)
      failures.concat(schema_errors(data).map { |error| "#{page.path}: #{error}" })
    rescue JSON::ParserError => error
      failures << "#{page.path}: #{error.message}"
    end

    assert_empty failures, failures.join("\n")
  end

  def test_representative_pages_emit_expected_schema_types
    assert_schema_types "/", %w[Person Organization WebSite ImageObject WebPage]
    assert_schema_types "/blog/", %w[Person Organization WebSite ImageObject Blog CollectionPage BreadcrumbList]
    assert_schema_types "/blog/the-ruby-gvl-and-scaling/", %w[Person Organization WebSite ImageObject Blog WebPage BlogPosting BreadcrumbList]
    assert_schema_types "/retainer.html", %w[Person Organization WebSite ImageObject WebPage Service BreadcrumbList]
    assert_schema_types "/four-line-fridays.html", %w[Person Organization WebSite ImageObject CollectionPage BreadcrumbList]
  end

  def test_site_image_dimensions_come_from_image_info
    graph = structured_data_for(page_by_url("/")).to_h.fetch("@graph")
    person = graph.find { |node| node.fetch("@type") == "Person" }
    organization = graph.find { |node| node.fetch("@type") == "Organization" }

    assert_equal Jekyll::ImageInfo.dimensions(site, Jekyll::StructuredData::PERSON_IMAGE_PATH), [person.dig("image", "width"), person.dig("image", "height")]
    assert_equal Jekyll::ImageInfo.dimensions(site, Jekyll::StructuredData::LOGO_PATH), [organization.dig("logo", "width"), organization.dig("logo", "height")]
  end

  def test_site_and_blog_metadata_come_from_config
    home_graph = structured_data_for(page_by_url("/")).to_h.fetch("@graph")
    organization = home_graph.find { |node| node.fetch("@type") == "Organization" }
    website = home_graph.find { |node| node.fetch("@type") == "WebSite" }
    blog = structured_data_for(page_by_url("/blog/")).to_h.fetch("@graph").find { |node| node.fetch("@type") == "Blog" }

    assert_equal site.config.dig("structured_data", "site_name"), organization.fetch("name")
    assert_equal site.config.dig("structured_data", "site_name"), website.fetch("name")
    assert_equal site.config.dig("structured_data", "blog_name"), blog.fetch("name")
    assert_equal site.config.dig("structured_data", "blog_description"), blog.fetch("description")
  end

  def self.site
    @site ||= begin
      site = Jekyll::Site.new(Jekyll.configuration({"source" => root_dir}))
      site.read
      site
    end
  end

  def self.root_dir
    File.expand_path("../..", __dir__)
  end

  private

  attr_reader :site

  def structured_pages
    @structured_pages ||= (site.pages + site.posts.docs).select { |page| page.output_ext == ".html" && page.data["layout"] }
  end

  def structured_data_for(page)
    Jekyll::StructuredData.new(site: site, page: page, seo: seo_for(page))
  end

  def assert_schema_types(url, expected)
    graph = structured_data_for(page_by_url(url)).to_h.fetch("@graph")
    actual = graph.map { |node| node.fetch("@type") }

    assert_equal expected, actual
  end

  def schema_errors(data)
    errors = []
    errors << "@context must be https://schema.org" unless data["@context"] == "https://schema.org"

    graph = data["@graph"]
    return errors << "@graph must be a non-empty array" unless graph.is_a?(Array) && graph.any?

    graph.each_with_index do |node, index|
      errors.concat(validate_schema_node(node, "@graph[#{index}]"))
    end

    errors
  end

  def validate_schema_node(node, path)
    errors = []
    type = node["@type"] if node.is_a?(Hash)
    schema = NODE_SCHEMAS[type]

    return ["#{path} must be an object with @type"] unless type
    return ["#{path} has unsupported @type #{type.inspect}"] unless schema

    missing = schema.reject { |key| present_schema_value?(node[key]) }
    errors << "#{path} #{type} missing #{missing.join(", ")}" if missing.any?

    node.each do |key, value|
      errors.concat(validate_schema_value(key, value, "#{path}.#{key}"))
    end

    errors
  end

  def validate_schema_value(key, value, path)
    errors = []

    case value
    when Hash
      if value["@type"]
        errors.concat(validate_schema_node(value, path))
      elsif value.key?("@id")
        errors << "#{path}.@id must be a URL" unless url?(value["@id"])
      end
    when Array
      errors << "#{path} must not be empty" if value.empty?
      value.each_with_index { |item, index| errors.concat(validate_schema_value(key, item, "#{path}[#{index}]")) }
    else
      errors.concat(validate_scalar_schema_value(key, value, path))
    end

    errors
  end

  def validate_scalar_schema_value(key, value, path)
    case key
    when "@id", "url", "contentUrl", "item", "availability"
      (url?(value) ? [] : ["#{path} must be a URL"])
    when "datePublished", "dateModified"
      iso8601_time?(value) ? [] : ["#{path} must be an ISO 8601 timestamp"]
    when "position", "width", "height", "wordCount"
      positive_integer?(value) ? [] : ["#{path} must be a positive integer"]
    when "price"
      value.is_a?(Numeric) ? [] : ["#{path} must be numeric"]
    when "@type", "name", "description", "headline", "caption", "priceCurrency", "encodingFormat", "inLanguage", "jobTitle", "alternateName", "givenName", "familyName"
      return [] if value.is_a?(String) && !value.empty?

      ["#{path} must be a non-empty string"]
    else
      []
    end
  end

  def present_schema_value?(value)
    return false if value.nil?
    return false if value.respond_to?(:empty?) && value.empty?

    true
  end

  def url?(value)
    value.is_a?(String) && value.match?(%r{\Ahttps?://})
  end

  def iso8601_time?(value)
    value.is_a?(String) && Time.iso8601(value)
  rescue ArgumentError
    false
  end

  def positive_integer?(value)
    value.is_a?(Integer) && value.positive?
  end

  def page_by_url(url)
    structured_pages.find { |page| page.url == url } || flunk("No structured page found for #{url}")
  end

  def seo_for(page)
    title = normalize(page.data["title"] || site.config["title"])
    summary = presence(page.data["summary"]) || site.config["description"]
    image_path = Jekyll::ImageInfo.share_path(page.data["image"])
    image_width, image_height = Jekyll::ImageInfo.dimensions(site, image_path)

    {
      title: title,
      description: truncate(normalize(summary), 160),
      canonical_url: absolute_url(page.url),
      image_url: absolute_url(image_path),
      image_path: image_path,
      image_width: image_width,
      image_height: image_height,
      image_type: Jekyll::ImageInfo.mime_type(image_path),
      image_alt: truncate(normalize(page.data["image_alt"] || title), 420),
      author_name: site.config.dig("author", "name") || "Nate Berkopec",
      author_url: site.config.dig("author", "url") || "https://www.nateberkopec.com/",
      lang: page.data["lang"] || site.config["lang"] || "en"
    }
  end

  def absolute_url(path)
    return path if path.to_s.match?(%r{\Ahttps?://})

    "#{site_url}/#{path.to_s.sub(%r{\A/}, "")}"
  end

  def site_url
    @site_url ||= begin
      url = site.config.fetch("url", "").to_s.delete_suffix("/")
      baseurl = site.config.fetch("baseurl", "").to_s
      [url, baseurl].reject(&:empty?).join("/").gsub(%r{(?<!:)//+}, "/").delete_suffix("/")
    end
  end

  def presence(value)
    normalized = normalize(value)
    normalized unless normalized.empty?
  end

  def truncate(text, max)
    return text if text.length <= max

    "#{text[0, max - 3]}..."
  end

  def normalize(value)
    value.to_s.gsub(/<[^>]*>/, "").gsub(/\s+/, " ").strip
  end
end
