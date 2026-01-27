require "yaml"
require "date"
require "pathname"

SITE_URL = "https://www.speedshop.co"

Jekyll::Hooks.register :site, :post_write do |site|
  posts_by_path = site.posts.docs.each_with_object({}) do |post, index|
    index[post.relative_path] = post.url
  end

  posts = Dir["#{site.source}/_posts/*.md"].map do |post_path|
    content = File.read(post_path, encoding: "UTF-8")
    front_matter = content.match(/\A---\n(.+?)\n---/m)
    next unless front_matter

    meta = YAML.safe_load(front_matter[1], permitted_classes: [Date, Time])
    date = meta["date"] ? Date.parse(meta["date"].to_s) : nil

    filename = File.basename(post_path, ".md")
    if filename =~ /^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)$/
      year, month, day, slug = $1, $2.rjust(2, "0"), $3.rjust(2, "0"), $4
      url_path = "/#{year}/#{month}/#{day}/#{slug}"
    else
      next
    end

    relative_path = Pathname(post_path).relative_path_from(Pathname(site.source)).to_s
    post_url = posts_by_path[relative_path]
    md_path = post_url ? post_url.sub(%r{/$}, "") : url_path
    html_url = post_url || "#{url_path}.html"

    body = content.sub(/\A---\n.+?\n---\n*/m, "")

    {
      title: meta["title"],
      summary: meta["summary"],
      url_md: "#{md_path}.md",
      url_html: html_url,
      date: date,
      body: body
    }
  end.compact.sort_by { |p| p[:date] || Date.new(1970, 1, 1) }.reverse

  llms_txt = <<~HEADER
    # Speedshop

    > Speedshop is a Ruby on Rails performance consultancy. This site contains blog posts about Ruby and Rails performance, scaling, and optimization.

    ## Blog Posts

  HEADER

  posts.each do |post|
    desc = post[:summary] ? ": #{post[:summary][0, 150].gsub(/\s+/, " ").strip}" : ""
    desc = desc[0, 150] + "..." if desc.length > 153
    llms_txt << "- [#{post[:title]}](#{SITE_URL}#{post[:url_md]})#{desc}\n"
  end

  File.write("#{site.dest}/llms.txt", llms_txt, encoding: "UTF-8")
  Jekyll.logger.info "LLMS", "Generated llms.txt"

  llms_full = <<~HEADER
    # Speedshop - Full Content

    > This file contains the full markdown content of all blog posts from Speedshop, a Ruby on Rails performance consultancy.

  HEADER

  posts.each do |post|
    llms_full << "\n---\n\n"
    llms_full << "## #{post[:title]}\n\n"
    llms_full << "URL: #{SITE_URL}#{post[:url_html]}\n\n"
    llms_full << post[:body]
    llms_full << "\n"
  end

  File.write("#{site.dest}/llms-full.txt", llms_full, encoding: "UTF-8")
  Jekyll.logger.info "LLMS", "Generated llms-full.txt"
end
