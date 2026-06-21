require "json"
require "liquid"
require "time"
require_relative "image_info"

module Jekyll
  class StructuredData
    LOGO_PATH = "/assets/img/speedshop_s_big.png"
    PERSON_IMAGE_PATH = "/assets/img/new_headshot_sm.jpg"

    def initialize(site:, page:, seo:)
      @site = site
      @page = page
      @seo = seo
    end

    def to_json_ld
      JSON.pretty_generate(to_h).gsub("</", "<\\/")
    end

    def to_h
      compact_hash({
        "@context" => "https://schema.org",
        "@graph" => graph
      })
    end

    private

    attr_reader :site, :page, :seo

    def graph
      nodes = [person, organization, website, primary_image]
      nodes << blog if blog_page? || post?
      nodes << web_page
      nodes << blog_posting if post?
      nodes << service if service_page?
      nodes << breadcrumb unless root_page?
      nodes
    end

    def person
      {
        "@type" => "Person",
        "@id" => person_id,
        "url" => author_url,
        "name" => author_name,
        "givenName" => "Nate",
        "familyName" => "Berkopec",
        "alternateName" => "nateberkopec",
        "jobTitle" => "Ruby on Rails performance consultant",
        "description" => "Nate Berkopec is a Ruby on Rails performance consultant, author, and Puma maintainer.",
        "knowsLanguage" => lang,
        "knowsAbout" => [
          "Ruby on Rails",
          "Ruby performance",
          "Rails performance",
          "Web performance",
          "Application performance",
          "Scalability",
          "Puma"
        ],
        "image" => {
          "@type" => "ImageObject",
          "@id" => person_image_id,
          "url" => person_image_url,
          "caption" => author_name,
          "width" => person_image_width,
          "height" => person_image_height
        },
        "sameAs" => [
          "https://twitter.com/nateberkopec",
          "https://github.com/nateberkopec"
        ]
      }
    end

    def organization
      {
        "@type" => "Organization",
        "@id" => organization_id,
        "name" => site_name,
        "url" => site_url,
        "description" => site_description,
        "logo" => {
          "@type" => "ImageObject",
          "@id" => logo_id,
          "url" => logo_url,
          "contentUrl" => logo_url,
          "caption" => "Speedshop logo",
          "width" => logo_width,
          "height" => logo_height
        },
        "founder" => id_reference(person_id)
      }
    end

    def website
      {
        "@type" => "WebSite",
        "@id" => website_id,
        "url" => site_url,
        "name" => site_name,
        "alternateName" => "speedshop.co",
        "description" => site_description,
        "publisher" => id_reference(organization_id),
        "image" => id_reference(logo_id),
        "inLanguage" => lang
      }
    end

    def primary_image
      compact_hash({
        "@type" => "ImageObject",
        "@id" => image_id,
        "url" => image_url,
        "contentUrl" => image_url,
        "caption" => image_alt,
        "width" => primary_image_width,
        "height" => primary_image_height,
        "encodingFormat" => seo[:image_type]
      })
    end

    def primary_image_width
      seo[:image_width] || primary_image_dimensions&.first
    end

    def primary_image_height
      seo[:image_height] || primary_image_dimensions&.last
    end

    def primary_image_dimensions
      @primary_image_dimensions ||= image_dimensions(primary_image_path)
    end

    def primary_image_path
      seo[:image_path] || path_from_url(image_url)
    end

    def blog
      {
        "@type" => "Blog",
        "@id" => blog_id,
        "isPartOf" => id_reference(website_id),
        "mainEntityOfPage" => id_reference(blog_page_id),
        "name" => blog_name,
        "description" => blog_description,
        "inLanguage" => lang,
        "dateModified" => xmlschema(latest_post_date),
        "publisher" => id_reference(organization_id)
      }
    end

    def web_page
      compact_hash({
        "@type" => page_type,
        "@id" => page_id,
        "url" => canonical_url,
        "name" => title,
        "description" => description,
        "isPartOf" => id_reference(website_id),
        "publisher" => id_reference(organization_id),
        "mainEntity" => id_reference(page_main_entity_id),
        "primaryImageOfPage" => id_reference(image_id),
        "breadcrumb" => breadcrumb_reference,
        "inLanguage" => lang
      })
    end

    def blog_posting
      compact_hash({
        "@type" => "BlogPosting",
        "@id" => article_id,
        "url" => canonical_url,
        "mainEntityOfPage" => id_reference(page_id),
        "isPartOf" => id_reference(blog_id),
        "author" => id_reference(person_id),
        "publisher" => id_reference(organization_id),
        "headline" => title,
        "name" => title,
        "description" => description,
        "image" => id_reference(image_id),
        "datePublished" => xmlschema(page_value("date")),
        "dateModified" => xmlschema(modified_time),
        "wordCount" => page_value("wordcount"),
        "inLanguage" => lang
      })
    end

    def service
      {
        "@type" => "Service",
        "@id" => service_id,
        "url" => canonical_url,
        "mainEntityOfPage" => id_reference(page_id),
        "name" => page_value("productName") || title,
        "description" => description,
        "provider" => id_reference(organization_id),
        "image" => id_reference(image_id),
        "offers" => {
          "@type" => "Offer",
          "price" => page_value("price"),
          "priceCurrency" => "USD",
          "availability" => "https://schema.org/InStock",
          "url" => canonical_url
        },
        "inLanguage" => lang
      }
    end

    def breadcrumb
      elements = [
        {
          "@type" => "ListItem",
          "position" => 1,
          "name" => "Home",
          "item" => site_url
        }
      ]

      if post?
        elements << {
          "@type" => "ListItem",
          "position" => 2,
          "name" => "Blog",
          "item" => blog_url
        }
      end

      elements << {
        "@type" => "ListItem",
        "position" => elements.length + 1,
        "name" => breadcrumb_current_name,
        "item" => canonical_url
      }

      {
        "@type" => "BreadcrumbList",
        "@id" => breadcrumb_id,
        "itemListElement" => elements
      }
    end

    def page_type
      collection_page? ? "CollectionPage" : "WebPage"
    end

    def collection_page?
      blog_page? || page_url == "/four-line-fridays.html"
    end

    def page_main_entity_id
      return organization_id if root_page?
      return blog_id if blog_page?
      return article_id if post?

      service_id if service_page?
    end

    def breadcrumb_reference
      id_reference(breadcrumb_id) unless root_page?
    end

    def breadcrumb_current_name
      blog_page? ? "Blog" : title
    end

    def root_page?
      page_url == "/"
    end

    def blog_page?
      page_url == "/blog/"
    end

    def post?
      page_value("layout") == "post"
    end

    def service_page?
      !!page_value("price")
    end

    def title
      seo[:title]
    end

    def description
      seo[:description]
    end

    def canonical_url
      seo[:canonical_url] || absolute_url(page_url)
    end

    def image_url
      seo[:image_url]
    end

    def image_alt
      seo[:image_alt]
    end

    def lang
      seo[:lang]
    end

    def author_name
      seo[:author_name] || "Nate Berkopec"
    end

    def author_url
      seo[:author_url] || "https://www.nateberkopec.com/"
    end

    def site_url
      @site_url ||= "#{site_root}/"
    end

    def site_root
      @site_root ||= begin
        url = site.config.fetch("url", "").to_s.delete_suffix("/")
        baseurl = site.config.fetch("baseurl", "").to_s
        [url, baseurl].reject(&:empty?).join("/").gsub(%r{(?<!:)//+}, "/").delete_suffix("/")
      end
    end

    def site_name
      structured_data_config.fetch("site_name", site.config.fetch("title", "")).to_s
    end

    def site_description
      site.config.fetch("description", "").to_s.gsub(/\s+/, " ").strip
    end

    def blog_name
      structured_data_config.fetch("blog_name", site_name).to_s
    end

    def blog_description
      structured_data_config.fetch("blog_description", site_description).to_s
    end

    def structured_data_config
      site.config.fetch("structured_data", {})
    end

    def page_url
      page_value("url")
    end

    def organization_id
      @organization_id ||= "#{site_config_url}/#organization"
    end

    def website_id
      @website_id ||= "#{site_config_url}/#website"
    end

    def logo_id
      @logo_id ||= "#{site_config_url}/#logo"
    end

    def site_config_url
      @site_config_url ||= site.config.fetch("url").delete_suffix("/")
    end

    def person_id
      @person_id ||= "#{author_url}#person"
    end

    def page_id
      @page_id ||= "#{canonical_url}#webpage"
    end

    def article_id
      @article_id ||= "#{canonical_url}#article"
    end

    def service_id
      @service_id ||= "#{canonical_url}#service"
    end

    def breadcrumb_id
      @breadcrumb_id ||= "#{canonical_url}#breadcrumb"
    end

    def image_id
      @image_id ||= "#{image_url}#primaryimage"
    end

    def person_image_id
      @person_image_id ||= "#{author_url}#person-image"
    end

    def blog_url
      @blog_url ||= "#{site_url}blog/"
    end

    def blog_id
      @blog_id ||= "#{blog_url}#blog"
    end

    def blog_page_id
      @blog_page_id ||= "#{blog_url}#webpage"
    end

    def logo_url
      @logo_url ||= absolute_url(LOGO_PATH)
    end

    def logo_width
      logo_dimensions&.first
    end

    def logo_height
      logo_dimensions&.last
    end

    def logo_dimensions
      @logo_dimensions ||= image_dimensions(LOGO_PATH)
    end

    def person_image_url
      @person_image_url ||= absolute_url(PERSON_IMAGE_PATH)
    end

    def person_image_width
      person_image_dimensions&.first
    end

    def person_image_height
      person_image_dimensions&.last
    end

    def person_image_dimensions
      @person_image_dimensions ||= image_dimensions(PERSON_IMAGE_PATH)
    end

    def image_dimensions(path)
      ImageInfo.dimensions(site, path)
    end

    def path_from_url(url)
      return url unless url.to_s.start_with?(site_url)

      "/#{url.delete_prefix(site_url)}"
    end

    def modified_time
      page_value("last_modified_at") || page_value("date")
    end

    def latest_post_date
      site.posts.docs.max_by(&:date)&.date
    end

    def page_value(key)
      return page[key] if page.respond_to?(:key?) && page.key?(key)
      return page.data[key] if page.respond_to?(:data) && page.data.key?(key)

      page.public_send(key) if page.respond_to?(key)
    end

    def id_reference(id)
      {"@id" => id} if id
    end

    def absolute_url(path)
      return path if path.to_s.match?(%r{\Ahttps?://})

      "#{site_root}/#{path.to_s.sub(%r{\A/}, "")}"
    end

    def xmlschema(value)
      return unless value
      return value.xmlschema if value.respond_to?(:xmlschema)

      Time.parse(value.to_s).xmlschema
    end

    def compact_hash(hash)
      hash.each_with_object({}) do |(key, value), result|
        compacted = compact_value(value)
        result[key] = compacted unless compacted.nil?
      end
    end

    def compact_value(value)
      case value
      when Hash
        compact_hash(value)
      when Array
        value.map { |item| compact_value(item) }
      else
        value
      end
    end
  end

  class StructuredDataTag < Liquid::Tag
    def render(context)
      StructuredData.new(
        site: context.registers[:site],
        page: context.registers[:page] || context["page"],
        seo: seo_context(context)
      ).to_json_ld
    end

    private

    def seo_context(context)
      {
        title: context["seo_title"],
        description: context["seo_description"],
        canonical_url: context["seo_canonical_url"],
        image_url: context["seo_image_url"],
        image_width: context["seo_image_width"],
        image_height: context["seo_image_height"],
        image_path: context["seo_image_path"],
        image_type: context["seo_image_type"],
        image_alt: context["seo_image_alt"],
        author_name: context["seo_author_name"],
        author_url: context["seo_author_url"],
        lang: context["seo_lang"]
      }
    end
  end
end

Liquid::Template.register_tag("structured_data_json_ld", Jekyll::StructuredDataTag)
